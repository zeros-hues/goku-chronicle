'use client';

import React, { useState, useMemo } from 'react';
import { MEMBERS, CLIENTS, PROJECT_BY_ID, entryHours, entryMemberHours, fmtDate, TODAY, dowShort, pad } from '@/lib/data';
import type { Entry } from '@/lib/data';
import ProjectPill from './ProjectPill';
import { IconDownload } from './Icons';

const ACTIVE_MEMBERS = MEMBERS.filter(m => m.active);

type RangeId = 'this-month' | 'last-month' | 'this-year' | 'all' | 'custom';

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'this-month', label: 'This month'   },
  { id: 'last-month', label: 'Last month'   },
  { id: 'this-year',  label: 'This year'    },
  { id: 'all',        label: 'All time'     },
  { id: 'custom',     label: 'Custom range' },
];

function fmt(h: number) { return h % 1 === 0 ? String(h) : h.toFixed(1); }

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} onClick={onChange} aria-pressed={on}>
      <div className="knob" />
    </button>
  );
}

interface ExportPageProps {
  entries: Entry[];
  showToast: (text: string, action?: { label: string; cb: () => void }) => void;
}

export default function ExportPage({ entries: all, showToast }: ExportPageProps) {
  const [range, setRange]             = useState<RangeId>('this-month');
  const [customStart, setCustomStart] = useState(() => { const d = new Date(TODAY); d.setDate(d.getDate() - 30); return fmtDate(d); });
  const [customEnd, setCustomEnd]     = useState(() => fmtDate(TODAY));
  const [client, setClient]           = useState('appasamy');
  const [billing, setBilling]         = useState('retainer');
  const [anon, setAnon]               = useState(true);

  function handleClientChange(newClient: string) {
    setClient(newClient);
    let newBilling: string;
    if (newClient === 'goku') {
      newBilling = 'internal';
    } else if (newClient === 'appasamy') {
      newBilling = 'retainer';
    } else {
      newBilling = 'all';
    }
    setBilling(newBilling);
    setAnon(newClient === 'appasamy' && newBilling === 'retainer');
  }

  function handleBillingChange(newBilling: string) {
    setBilling(newBilling);
    setAnon(client === 'appasamy' && newBilling === 'retainer');
  }

  const [rangeStart, rangeEnd] = useMemo(() => {
    const t = new Date(TODAY);
    if (range === 'this-month') return [new Date(t.getFullYear(), t.getMonth(), 1), t];
    if (range === 'last-month') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    if (range === 'this-year')  return [new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)];
    if (range === 'custom')     return [new Date(customStart + 'T00:00:00'), new Date(customEnd + 'T00:00:00')];
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }, [range, customStart, customEnd]);

  const filtered = useMemo(() => all.filter(e => {
    if (e.trashed) return false;
    const d = new Date(e.date + 'T00:00:00');
    if (d < rangeStart || d > rangeEnd) return false;
    const proj = PROJECT_BY_ID[e.projectId];
    if (client !== 'all' && proj?.clientId !== client) return false;
    if (billing !== 'all' && e.billing !== billing) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [all, rangeStart, rangeEnd, client, billing]);

  const totalHrs = filtered.reduce((s, e) => s + entryHours(e), 0);

  const isRetainerAnon = anon && billing === 'retainer';

  function downloadCSV() {
    const headers = ['Date', 'Day', 'Project', 'Task'];
    if (anon) {
      headers.push('No. of resources', isRetainerAnon ? 'Working Hours' : 'Hours');
    } else {
      ACTIVE_MEMBERS.forEach(m => headers.push(m.init));
    }
    headers.push('Total');

    const rows = filtered.map(e => {
      const proj = PROJECT_BY_ID[e.projectId];
      const d = new Date(e.date + 'T00:00:00');
      const row: (string | number)[] = [
        `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        dowShort(d),
        `"${(proj?.clientId !== 'goku' ? proj?.clientName + ' · ' : '') + (proj?.name ?? e.projectId)}"`,
        `"${e.task.replace(/"/g, '""')}"`,
      ];
      if (anon) {
        if (e.type === 'meeting') {
          row.push(
            e.meetingPeople ?? 0,
            isRetainerAnon ? (e.meetingDuration ?? 0) : `${e.meetingDuration}×${e.meetingPeople}`,
          );
        } else {
          const vals = Object.values(e.hours).filter(v => v > 0);
          row.push(vals.length, vals.join('+'));
        }
      } else {
        ACTIVE_MEMBERS.forEach(m => row.push(e.type === 'task' ? (e.hours[m.id] ?? 0) : ''));
      }
      row.push(entryHours(e));
      return row.join(',');
    });

    if (isRetainerAnon) {
      const colCount = headers.length;
      const grandTotalRow = Array(colCount).fill('');
      grandTotalRow[colCount - 2] = 'GRAND TOTAL';
      grandTotalRow[colCount - 1] = totalHrs;
      rows.push(grandTotalRow.join(','));
    }

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronicle-export-${fmtDate(TODAY)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} entries as CSV`);
  }

  function downloadJSON() {
    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      entries: filtered,
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronicle-backup-${fmtDate(TODAY)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Backup saved — ${filtered.length} entries`);
  }

  return (
    <div className="exp-grid">

      {/* Left panel */}
      <div className="exp-side">
        <div className="card">
          <h3 style={{ margin: '0 0 14px' }}>Filters</h3>

          {/* Date range */}
          <div className="input-block">
            <label className="field-label">Date range</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {RANGES.map(r => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={'filter-chip' + (range === r.id ? ' active' : '')}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div className="field-label" style={{ marginBottom: 4 }}>From</div>
                  <input type="date" className="field-input" value={customStart}
                    onChange={e => setCustomStart(e.target.value)} max={customEnd}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '7px 10px' }} />
                </div>
                <div>
                  <div className="field-label" style={{ marginBottom: 4 }}>To</div>
                  <input type="date" className="field-input" value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)} min={customStart}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '7px 10px' }} />
                </div>
              </div>
            )}
          </div>

          {/* Client */}
          <div className="input-block">
            <label className="field-label">Client</label>
            <select className="field-input" value={client} onChange={e => handleClientChange(e.target.value)}>
              <option value="all">All clients</option>
              {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Billing — hidden for Goku Studio (always Internal) */}
          {client !== 'goku' ? (
            <div className="input-block">
              <label className="field-label">Billing type</label>
              <select className="field-input" value={billing} onChange={e => handleBillingChange(e.target.value)}>
                <option value="all">All</option>
                <option value="retainer">Retainership</option>
                <option value="out">Out of retainership</option>
                {client === 'all' && <option value="internal">Internal</option>}
              </select>
            </div>
          ) : (
            <div className="input-block">
              <label className="field-label">Billing type</label>
              <span className="billing-badge internal" style={{ display: 'inline-block', marginTop: 2 }}>Internal</span>
            </div>
          )}

          {/* Anonymous mode */}
          <div className="toggle">
            <div>
              <div style={{ fontWeight: 500 }}>Anonymous mode</div>
              <div style={{ fontSize: 11, color: 'var(--ink-fade)' }}>Hide names — for client-facing exports</div>
            </div>
            <Switch on={anon} onChange={() => setAnon(v => !v)} />
          </div>
        </div>

        {/* Download */}
        <div className="card">
          <h3 style={{ margin: '0 0 10px' }}>Download</h3>
          <div style={{ fontSize: 12, color: 'var(--ink-fade)', marginBottom: 14 }}>
            {filtered.length} entries · {totalHrs.toFixed(1)}h
          </div>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-ghost)', fontStyle: 'italic', padding: '8px 0' }}>
              No entries to export
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={downloadCSV}>
                <IconDownload size={14} /> Excel (.xlsx)
              </button>
              <button className="btn" style={{ justifyContent: 'center' }} onClick={downloadJSON}>
                <IconDownload size={14} /> JSON backup
              </button>
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-fade)', lineHeight: 1.5 }}>
            JSON is Chronicle&apos;s own backup format — re-importing it brings everything back exactly as it was.
          </div>
        </div>
      </div>

      {/* Right: live preview */}
      <div>
        <div className="exp-preview">
          <div className="exp-preview-h">
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500 }}>Live preview</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-fade)' }}>
                {anon ? 'Anonymous · client-safe' : 'Named · internal'}
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-fade)' }}>
              {pad(rangeStart.getDate())}/{pad(rangeStart.getMonth() + 1)} → {pad(rangeEnd.getDate())}/{pad(rangeEnd.getMonth() + 1)}
            </span>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 560 }}>
            {filtered.length === 0 ? (
              <div className="empty" style={{ padding: 60 }}>
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="empty-illustration" style={{ margin: '0 auto 16px', display: 'block' }}>
                  <rect x="8" y="10" width="40" height="36" rx="3" stroke="currentColor" strokeWidth="1.4" fill="none"/>
                  <line x1="8" y1="20" x2="48" y2="20" stroke="currentColor" strokeWidth="1.4"/>
                  <line x1="16" y1="30" x2="40" y2="30" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 3"/>
                  <line x1="16" y1="38" x2="32" y2="38" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 3"/>
                  <circle cx="44" cy="42" r="8" fill="var(--paper)" stroke="currentColor" strokeWidth="1.4"/>
                  <line x1="44" y1="38" x2="44" y2="46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="40" y1="42" x2="48" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <h3>Nothing to export</h3>
                <p>Loosen the filters to see entries here.</p>
              </div>
            ) : (
              <table className="ts-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Date</th>
                    <th style={{ width: 50 }}>Day</th>
                    <th>Project</th>
                    <th>Task</th>
                    {anon ? (
                      <>
                        <th className="num" style={{ width: 90 }}>No. of Resources</th>
                        <th className="num" style={{ width: 100 }}>{isRetainerAnon ? 'Working Hours' : 'Hours'}</th>
                      </>
                    ) : (
                      ACTIVE_MEMBERS.map(m => (
                        <th key={m.id} className="num member-col-h"
                          style={{
                            width: 52,
                            color: `color-mix(in oklab, ${m.color} 80%, var(--ink) 20%)`,
                            boxShadow: `inset 0 0 0 999px color-mix(in oklab, ${m.color} 10%, transparent)`,
                          }}>
                          <span className="mc-dot" style={{ background: m.color }} />
                          {m.init}
                        </th>
                      ))
                    )}
                    <th className="num" style={{ width: 60 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 60).map(e => {
                    const proj = PROJECT_BY_ID[e.projectId];
                    const d = new Date(e.date + 'T00:00:00');
                    const anonCount = e.type === 'meeting' ? (e.meetingPeople ?? 0) : Object.values(e.hours).filter(v => v > 0).length;
                    const anonWorkHrs = e.type === 'meeting'
                      ? (isRetainerAnon ? `${e.meetingDuration ?? 0}h` : `${e.meetingDuration}×${e.meetingPeople}`)
                      : Object.values(e.hours).filter(v => v > 0).join('+');
                    return (
                      <tr key={e.id} className="entry" style={{ cursor: 'default' }}>
                        <td className="mono" style={{ color: 'var(--ink-fade)', fontSize: 12 }}>{pad(d.getDate())}/{pad(d.getMonth() + 1)}</td>
                        <td style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-fade)', fontSize: 12 }}>{dowShort(d)}</td>
                        <td>{proj && <ProjectPill project={proj} clientName={proj.clientId !== 'goku' ? proj.clientName : undefined} />}</td>
                        <td className="task-cell" style={{ fontSize: 12.5 }}>
                          {e.type === 'meeting' && <span className="meet">Meeting</span>}
                          {e.task}
                        </td>
                        {anon ? (
                          <>
                            <td className="hrs"><span className="v">{anonCount}</span></td>
                            <td className="hrs"><span className="v">{anonWorkHrs}</span></td>
                          </>
                        ) : (
                          ACTIVE_MEMBERS.map(m => {
                            const v = entryMemberHours(e, m.id);
                            return (
                              <td key={m.id} className={`hrs${v === 0 ? ' zero' : ''}`}
                                style={{ boxShadow: `inset 0 0 0 999px color-mix(in oklab, ${m.color} 6%, transparent)` }}>
                                {v === 0
                                  ? <span className="empty">—</span>
                                  : <><span className="v" style={{ color: `color-mix(in oklab, ${m.color} 65%, var(--ink) 35%)` }}>{fmt(v)}</span><span className="u">h</span></>
                                }
                              </td>
                            );
                          })
                        )}
                        <td className="hrs total">
                          <span className="v">{fmt(entryHours(e))}</span><span className="u">h</span>
                        </td>
                      </tr>
                    );
                  })}
                  {isRetainerAnon && filtered.length > 0 && (
                    <tr style={{ borderTop: '2px solid var(--paper-edge)' }}>
                      <td colSpan={4} style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink)', textAlign: 'right' }}>
                        Grand Total
                      </td>
                      <td className="hrs" />
                      <td className="hrs total" style={{ fontWeight: 700, fontSize: 14 }}>
                        <span className="v">{fmt(totalHrs)}</span><span className="u">h</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {filtered.length > 60 && (
              <div style={{ padding: 14, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-fade)', borderTop: '1px dashed var(--paper-rule)' }}>
                + {filtered.length - 60} more rows in the file
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
