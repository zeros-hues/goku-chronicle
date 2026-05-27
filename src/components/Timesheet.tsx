'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import {
  fmtDate, entryHours, entryMemberHours,
  dowFull, monShort,
} from '@/lib/data';
import type { Entry, BillingType, Client, Member, Project } from '@/lib/data';
import ProjectPill from './ProjectPill';
import { IconSearch, IconCaret, IconTrash, IconCalendar, IconEdit } from './Icons';

type DateRangeId = 'this-month' | 'last-month' | 'last-30' | 'last-60' | 'this-year' | 'all';
type SortKey = 'date' | 'project' | 'total';
type SortDir = 'asc' | 'desc';

const DATE_RANGES: { id: DateRangeId; label: string }[] = [
  { id: 'this-month', label: 'This month'   },
  { id: 'last-month', label: 'Last month'   },
  { id: 'last-30',    label: 'Last 30 days' },
  { id: 'last-60',    label: 'Last 60 days' },
  { id: 'this-year',  label: 'This year'    },
  { id: 'all',        label: 'All entries'  },
];

type ProjectWithMeta = Project & { clientId: string; clientName: string };

function fmt(h: number) { return h % 1 === 0 ? String(h) : h.toFixed(1); }

function FilterChip({
  label, icon, dot, open, onToggle, children,
}: {
  label: string; icon?: React.ReactNode; dot?: boolean;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onToggle]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={'filter-chip' + (dot ? ' active' : '')} onClick={onToggle}>
        {icon}
        {dot && !icon && <span className="dot" />}
        <span>{label}</span>
        <IconCaret size={10} className="caret" />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={onToggle} />
          <div className="dropdown">{children}</div>
        </>
      )}
    </div>
  );
}

function SortMark({ colKey, sortBy }: { colKey: SortKey; sortBy: { key: SortKey; dir: SortDir } }) {
  if (sortBy.key !== colKey) return <span className="sort-mark">↕</span>;
  return <span className="sort-mark">{sortBy.dir === 'desc' ? '↓' : '↑'}</span>;
}

function EmptyTimesheet({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="empty">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="empty-illustration" style={{ margin: '0 auto 20px', display: 'block' }}>
        <rect x="12" y="16" width="48" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="12" y1="28" x2="60" y2="28" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="20" y="8" width="4" height="12" rx="2" fill="currentColor" opacity="0.4"/>
        <rect x="48" y="8" width="4" height="12" rx="2" fill="currentColor" opacity="0.4"/>
        <line x1="20" y1="40" x2="52" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
        <line x1="20" y1="50" x2="44" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
      </svg>
      <h3>{hasFilters ? 'No entries match' : 'No entries yet'}</h3>
      <p>
        {hasFilters
          ? 'Try widening the date range or clearing the filters.'
          : 'Your hours will appear here once you log your first entry.'}
      </p>
    </div>
  );
}

interface TimesheetProps {
  entries: Entry[];
  clients: Client[];
  members: Member[];
  projectById: Record<string, ProjectWithMeta>;
  onTrash: (ids: Set<number>) => void;
  onRestore: (ids: Set<number>) => void;
  onEdit: (entry: Entry) => void;
  showToast: (text: string, action?: { label: string; cb: () => void }) => void;
  newEntryId?: number | null;
  searchRef?: React.RefObject<HTMLInputElement>;
}

export default function Timesheet({ entries, clients, members, projectById, onTrash, onRestore, onEdit, showToast, newEntryId, searchRef }: TimesheetProps) {
  const today = useMemo(() => new Date(), []);
  const TODAY_STR = fmtDate(today);

  const [search, setSearch]     = useState('');
  const [range, setRange]       = useState<DateRangeId>('this-month');
  const [client, setClient]     = useState<string>('all');
  const [billing, setBilling]   = useState<string>('all');
  const [member, setMember]     = useState<string>('all');
  const [sortBy, setSortBy]     = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const searchInputRef = searchRef ?? internalSearchRef;
  const tbodyRef       = useRef<HTMLTableSectionElement>(null);
  const hasAnimatedRef = useRef(false);

  const [rangeStart, rangeEnd] = useMemo(() => {
    const t = new Date(today);
    if (range === 'this-month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    if (range === 'last-month') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    if (range === 'last-30') { const s = new Date(t); s.setDate(t.getDate() - 30); return [s, t]; }
    if (range === 'last-60') { const s = new Date(t); s.setDate(t.getDate() - 60); return [s, t]; }
    if (range === 'this-year') return [new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)];
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }, [range, today]);

  const filtered = useMemo(() => entries.filter(e => {
    if (e.trashed) return false;
    const d = new Date(e.date + 'T00:00:00');
    if (d < rangeStart || d > rangeEnd) return false;
    const proj = projectById[e.projectId];
    if (client !== 'all' && proj?.clientId !== client) return false;
    if (billing !== 'all' && e.billing !== billing) return false;
    if (member !== 'all' && e.type !== 'meeting' && !e.hours[member]) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!e.task.toLowerCase().includes(s) && !proj?.name.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [entries, rangeStart, rangeEnd, client, billing, member, search, projectById]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    const dateKeys = Array.from(map.keys());
    if (sortBy.key === 'date' || sortBy.key === 'project') {
      dateKeys.sort((a, b) => sortBy.dir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
    } else {
      dateKeys.sort((a, b) => {
        const ta = map.get(a)!.reduce((s, e) => s + entryHours(e), 0);
        const tb = map.get(b)!.reduce((s, e) => s + entryHours(e), 0);
        return sortBy.dir === 'desc' ? tb - ta : ta - tb;
      });
    }
    return dateKeys.map(date => {
      const dayEntries = map.get(date)!.slice();
      if (sortBy.key === 'project') {
        dayEntries.sort((a, b) => {
          const pa = projectById[a.projectId]?.name ?? '';
          const pb = projectById[b.projectId]?.name ?? '';
          return sortBy.dir === 'desc' ? pb.localeCompare(pa) : pa.localeCompare(pb);
        });
      }
      return { date, entries: dayEntries };
    });
  }, [filtered, sortBy, projectById]);

  const totalInView = filtered.reduce((s, e) => s + entryHours(e), 0);

  useEffect(() => {
    if (hasAnimatedRef.current || grouped.length === 0 || !tbodyRef.current) return;
    hasAnimatedRef.current = true;
    const rows = tbodyRef.current.querySelectorAll('tr.entry');
    if (rows.length === 0) return;
    gsap.fromTo(rows,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out', stagger: 0.025, clearProps: 'y,opacity' },
    );
  }, [grouped]);

  useEffect(() => {
    if (!newEntryId) return;
    setHighlightId(newEntryId);
    const timeout = setTimeout(() => {
      const el = document.querySelector(`[data-entry-id="${newEntryId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightId(null), 2000);
    }, 100);
    return () => clearTimeout(timeout);
  }, [newEntryId]);

  function toggleSort(key: SortKey) {
    setSortBy(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' }
    );
  }

  function toggleSelect(id: number) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function trashSelectedEntries(ids: Set<number>) {
    onTrash(ids);
    const n = ids.size;
    showToast(
      n === 1 ? 'Moved to trash' : `${n} entries moved to trash`,
      { label: 'Undo', cb: () => onRestore(ids) }
    );
  }

  function trashSelected() {
    trashSelectedEntries(selected);
    setSelected(new Set());
  }

  function drop(key: string) { setOpenDrop(p => p === key ? null : key); }

  const hasFilters = client !== 'all' || billing !== 'all' || member !== 'all' || !!search;
  const rangeLabel   = DATE_RANGES.find(r => r.id === range)?.label ?? 'This month';
  const clientLabel  = client === 'all' ? 'All clients' : clients.find(c => c.id === client)?.name ?? 'All clients';
  const billingLabel = billing === 'all' ? 'All billing'
    : billing === 'retainer' ? 'Retainership'
    : billing === 'out' ? 'Out of Retainer'
    : 'Internal';
  const memberLabel  = member === 'all' ? 'All members' : members.find(m => m.id === member)?.name ?? 'All members';

  const singleSelected = selected.size === 1 ? Array.from(selected)[0] : null;

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'e' && ev.key !== 'E') return;
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (singleSelected === null) return;
      const entry = entries.find(x => x.id === singleSelected);
      if (entry) { onEdit(entry); setSelected(new Set()); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [singleSelected, entries, onEdit]);

  return (
    <>
      {/* Toolbar */}
      <div className="ts-toolbar">
        <div className="search-box">
          <IconSearch size={14} className="ic" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks or projects…"
          />
        </div>

        <FilterChip label={rangeLabel} icon={<IconCalendar size={12} />}
          open={openDrop === 'range'} onToggle={() => drop('range')}>
          <div className="dropdown-section">Range</div>
          {DATE_RANGES.map(r => (
            <div key={r.id} className={'dropdown-item' + (range === r.id ? ' selected' : '')}
              onClick={() => { setRange(r.id); setOpenDrop(null); }}>{r.label}</div>
          ))}
        </FilterChip>

        <FilterChip label={clientLabel} dot={client !== 'all'}
          open={openDrop === 'client'} onToggle={() => drop('client')}>
          {[{ id: 'all', label: 'All clients' }, ...clients.map(c => ({ id: c.id, label: c.name }))].map(o => (
            <div key={o.id} className={'dropdown-item' + (client === o.id ? ' selected' : '')}
              onClick={() => { setClient(o.id); setOpenDrop(null); }}>{o.label}</div>
          ))}
        </FilterChip>

        <FilterChip label={billingLabel} dot={billing !== 'all'}
          open={openDrop === 'billing'} onToggle={() => drop('billing')}>
          {([
            { id: 'all', label: 'All billing' },
            { id: 'retainer', label: 'Retainership' },
            { id: 'out', label: 'Out of Retainership' },
            { id: 'internal', label: 'Internal' },
          ] as { id: string; label: string }[]).map(o => (
            <div key={o.id} className={'dropdown-item' + (billing === o.id ? ' selected' : '')}
              onClick={() => { setBilling(o.id as BillingType | 'all'); setOpenDrop(null); }}>{o.label}</div>
          ))}
        </FilterChip>

        <FilterChip label={memberLabel} dot={member !== 'all'}
          open={openDrop === 'member'} onToggle={() => drop('member')}>
          <div className={'dropdown-item' + (member === 'all' ? ' selected' : '')}
            onClick={() => { setMember('all'); setOpenDrop(null); }}>All members</div>
          <div className="dropdown-section">Team</div>
          {members.map(m => (
            <div key={m.id} className={'dropdown-item' + (member === m.id ? ' selected' : '')}
              onClick={() => { setMember(m.id); setOpenDrop(null); }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: m.color, display: 'grid', placeItems: 'center', color: 'var(--paper)', fontFamily: 'var(--font-serif)', fontSize: 9, flexShrink: 0 }}>
                {m.init.slice(0, 1)}
              </span>
              {m.name}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', fontSize: 11, marginLeft: 4 }}>{m.init}</span>
            </div>
          ))}
        </FilterChip>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 600 }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · {totalInView.toFixed(1)}h total
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="ts-scroll">
        {grouped.length === 0 ? (
          <EmptyTimesheet hasFilters={hasFilters || range !== 'all'} />
        ) : (
          <table className={`ts-table${selected.size > 0 ? ' selection-mode' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: 34 }} />
                <th style={{ width: 32, color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>#</th>
                <th className={'sortable' + (sortBy.key === 'project' ? ' sorted' : '')} style={{ width: 200 }} onClick={() => toggleSort('project')}>
                  Project <SortMark colKey="project" sortBy={sortBy} />
                </th>
                <th>Task</th>
                {members.map(m => (
                  <th key={m.id} className="num member-col-h"
                    style={{
                      width: 56,
                      color: `color-mix(in oklab, ${m.color} 80%, var(--ink) 20%)`,
                      boxShadow: `inset 0 0 0 999px color-mix(in oklab, ${m.color} 10%, transparent)`,
                    }}>
                    <span className="mc-dot" style={{ background: m.color }} />
                    {m.init}
                  </th>
                ))}
                <th className={'num sortable' + (sortBy.key === 'total' ? ' sorted' : '')} style={{ width: 76 }} onClick={() => toggleSort('total')}>
                  Total <SortMark colKey="total" sortBy={sortBy} />
                </th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {grouped.map(({ date, entries: dayEntries }) => {
                const d = new Date(date + 'T00:00:00');
                const isToday = date === TODAY_STR;
                const dailyTotal = dayEntries.reduce((s, e) => s + entryHours(e), 0);
                const memberTotals = Object.fromEntries(
                  members.map(m => [m.id, dayEntries.reduce((s, e) => s + entryMemberHours(e, m.id), 0)])
                );
                const allIds = dayEntries.map(e => e.id);
                const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
                const someSelected = allIds.some(id => selected.has(id));

                return (
                  <React.Fragment key={date}>
                    <tr className="date-group-row">
                      <td style={{ verticalAlign: 'bottom', paddingBottom: 10 }}>
                        <div
                          className={`row-checkbox group${allSelected ? ' checked' : ''}${!allSelected && someSelected ? ' indeterminate' : ''}`}
                          onClick={ev => {
                            ev.stopPropagation();
                            setSelected(prev => {
                              const n = new Set(prev);
                              if (allSelected) allIds.forEach(id => n.delete(id));
                              else allIds.forEach(id => n.add(id));
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td colSpan={4 + members.length}>
                        <div className="date-block">
                          <span className="day">{d.getDate()}</span>
                          <span className="mon">{monShort(d)} {d.getFullYear()}</span>
                          <span className="dow">{dowFull(d)}</span>
                          {isToday && <span className="today-flag">Today</span>}
                        </div>
                      </td>
                    </tr>

                    {dayEntries.map((e, idx) => {
                      const proj = projectById[e.projectId];
                      const isExp = expanded.has(e.id);
                      const isSel = selected.has(e.id);
                      const isHighlighted = highlightId === e.id;

                      return (
                        <React.Fragment key={e.id}>
                          <tr
                            data-entry-id={e.id}
                            className={`entry${isExp ? ' expanded' : ''}${isHighlighted ? ' row-highlight' : ''}`}
                            onClick={() => toggleExpand(e.id)}
                          >
                            <td>
                              <div
                                className={`row-checkbox${isSel ? ' checked' : ''}`}
                                onClick={ev => { ev.stopPropagation(); toggleSelect(e.id); }}
                              />
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-fade)', textAlign: 'center' }}>
                              {idx + 1}
                            </td>
                            <td>{proj && <ProjectPill project={proj} clientName={proj.clientId !== proj.clientId.slice(0, -5) ? proj.clientName : undefined} />}</td>
                            <td className="task-cell">
                              {e.type === 'meeting' && (
                                <span className="meet">Meeting · {e.meetingPeople}p · {e.meetingDuration}h</span>
                              )}
                              {e.task}
                            </td>
                            {members.map(m => {
                              const v = entryMemberHours(e, m.id);
                              const tint = v > 0 ? `color-mix(in oklab, ${m.color} 65%, var(--ink) 35%)` : undefined;
                              return (
                                <td key={m.id}
                                  className={`hrs member-col${v === 0 ? ' zero' : ''}`}
                                  style={{ boxShadow: `inset 0 0 0 999px color-mix(in oklab, ${m.color} 6%, transparent)` }}>
                                  {v === 0
                                    ? <span className="hrs"><span className="empty">—</span></span>
                                    : <span className="hrs"><span className="v" style={tint ? { color: tint } : undefined}>{fmt(v)}</span><span className="u">h</span></span>
                                  }
                                </td>
                              );
                            })}
                            <td className="hrs total">
                              <span className="v">{fmt(entryHours(e))}</span>
                              <span className="u">h</span>
                            </td>
                          </tr>

                          {isExp && (
                            <tr className="expanded-detail">
                              <td colSpan={5 + members.length}>
                                <div className="expanded-detail-content">
                                  <div className="description">{e.task}</div>
                                  <div className="chip-row">
                                    {e.type === 'meeting' ? (
                                      <div className="member-chip" style={{ background: 'var(--paper-deep)' }}>
                                        <span>{e.meetingPeople} people · {e.meetingDuration}h</span>
                                      </div>
                                    ) : (
                                      Object.entries(e.hours).map(([mid, h]) => {
                                        const mem = members.find(x => x.id === mid);
                                        if (!mem) return null;
                                        return (
                                          <div key={mid} className="member-chip">
                                            <span className="av" style={{ background: mem.color, width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--paper)', fontFamily: 'var(--font-serif)', fontSize: 10 }}>
                                              {mem.init.slice(0, 1)}
                                            </span>
                                            <span>{mem.name}</span>
                                            <span className="v">{h}h</span>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                  <div className="detail-meta-row">
                                    <span><b>Billing</b> <span className={`billing-badge ${e.billing}`}>
                                      {e.billing === 'retainer' ? 'Retainership' : e.billing === 'out' ? 'Out of Retainership' : 'Internal'}
                                    </span></span>
                                    <span><b>ID</b> #{String(e.id).padStart(5, '0')}</span>
                                    <span><b>Project</b> {proj?.clientName} · {proj?.name}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button
                                      className="btn btn-sm"
                                      onClick={ev => { ev.stopPropagation(); onEdit(e); }}
                                    >
                                      <IconEdit size={12} /> Edit entry
                                    </button>
                                    <button
                                      className="btn btn-sm"
                                      style={{ color: 'var(--accent-deep)' }}
                                      onClick={ev => {
                                        ev.stopPropagation();
                                        trashSelectedEntries(new Set([e.id]));
                                        setExpanded(prev => { const n = new Set(prev); n.delete(e.id); return n; });
                                      }}
                                    >
                                      <IconTrash size={12} /> Move to trash
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    <tr className="daily-total">
                      <td />
                      <td colSpan={2} className="daily-total-label">
                        <span className="hand" style={{ fontSize: 18, marginRight: 8, color: 'var(--accent)' }}>↳</span>
                        Daily total
                      </td>
                      <td className="daily-total-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'left', color: 'var(--ink-fade)', paddingLeft: 10 }}>
                        {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                      </td>
                      {members.map(m => {
                        const v = memberTotals[m.id];
                        const tint = v > 0 ? `color-mix(in oklab, ${m.color} 75%, var(--ink) 25%)` : undefined;
                        return (
                          <td key={m.id} className="hrs total member-col"
                            style={{ boxShadow: `inset 0 0 0 999px color-mix(in oklab, ${m.color} 10%, transparent)` }}>
                            {v === 0
                              ? <span className="hrs"><span className="empty">—</span></span>
                              : <span className="hrs"><span className="v" style={tint ? { color: tint } : undefined}>{fmt(v)}</span><span className="u">h</span></span>
                            }
                          </td>
                        );
                      })}
                      <td className="hrs total">
                        <span className="v">{fmt(dailyTotal)}</span>
                        <span className="u">h</span>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="selection-bar">
          <span className="count">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())}>Clear</button>
          {singleSelected !== null && (
            <button onClick={() => {
              const e = entries.find(x => x.id === singleSelected);
              if (e) { onEdit(e); setSelected(new Set()); }
            }}>
              <IconEdit size={12} /> Edit
            </button>
          )}
          <button className="danger" onClick={trashSelected}>
            <IconTrash size={12} /> Move to trash
          </button>
        </div>
      )}
    </>
  );
}
