'use client';

import { useState, useRef, useMemo } from 'react';
import type { Entry, Client, Member, BillingType, Project } from '@/lib/data';
import ProjectPill from './ProjectPill';
import { IconX, IconCheck, IconWarn } from './Icons';

/* ── External JSON format ────────────────────────────────────── */

interface ExternalHour {
  member: string;
  initials: string;
  hours: number;
}

interface ExternalEntry {
  date: string;
  project?: string;
  projectName?: string;
  client?: string;
  clientName?: string;
  task?: string;
  taskDescription?: string;
  isMeeting: boolean;
  personCount?: number;
  meetingDuration?: number;
  billingType?: string;
  hours?: ExternalHour[];
}

type AnyEntry = Entry | ExternalEntry;

function isExternal(e: AnyEntry): e is ExternalEntry {
  return !('projectId' in e) && ('project' in e || 'isMeeting' in e);
}

/* ── Conversion helpers ─────────────────────────────────────── */

function toBilling(s: string | undefined): BillingType {
  if (!s) return 'retainer';
  const map: Record<string, BillingType> = {
    RETAINERSHIP: 'retainer',
    OUT_OF_RETAINERSHIP: 'out',
    INTERNAL: 'internal',
    retainer: 'retainer',
    out: 'out',
    internal: 'internal',
  };
  return map[s] ?? 'retainer';
}

type ProjectWithMeta = Project & { clientId: string; clientName: string };

function calcDisplayHours(e: AnyEntry): number {
  if (isExternal(e)) {
    if (e.isMeeting) return e.meetingDuration ?? 1;
    return (e.hours ?? []).reduce((s, h) => s + (Number(h.hours) || 0), 0);
  }
  if (e.type === 'meeting') return (e.meetingDuration ?? 0);
  return Object.values(e.hours).reduce((a, b) => a + b, 0);
}

function isDuplicate(e: Entry, existing: Entry[]): boolean {
  return existing.some(
    x => !x.trashed && x.date === e.date && x.projectId === e.projectId && x.task === e.task
  );
}

/* ── Types ───────────────────────────────────────────────────── */

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';
type EntryStatus  = 'new' | 'duplicate' | 'unknown';

interface PreviewRow {
  raw:          AnyEntry;
  converted:    Entry | null;
  status:       EntryStatus;
  projectLabel: string;
  clientLabel:  string;
  taskLabel:    string;
  displayHours: number;
}

interface ImportModalProps {
  existingEntries: Entry[];
  clients: Client[];
  members: Member[];
  onImport: (entries: Entry[]) => void;
  onClose: () => void;
}

export default function ImportModal({ existingEntries, clients, members, onImport, onClose }: ImportModalProps) {
  const [status,    setStatus]   = useState<ImportStatus>('idle');
  const [isDragOver, setDrag]    = useState(false);
  const [rows,      setRows]     = useState<PreviewRow[]>([]);
  const [selected,  setSelected] = useState<Set<number>>(new Set());
  const [errorMsg,  setError]    = useState('');
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Build lookup maps from fetched data
  const { allProjects, projectById, initToMemberId } = useMemo(() => {
    const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientId: c.id, clientName: c.name })));
    const projectById = Object.fromEntries(allProjects.map(p => [p.id, p]));
    const initToMemberId: Record<string, string> = {};
    for (const m of members) initToMemberId[m.init.toLowerCase()] = m.id;
    return { allProjects, projectById, initToMemberId };
  }, [clients, members]);

  function resolveProject(projectName: string, clientName: string): ProjectWithMeta | undefined {
    return allProjects.find(
      p =>
        p.name.toLowerCase() === projectName.toLowerCase() &&
        p.clientName.toLowerCase() === clientName.toLowerCase()
    ) ?? allProjects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
  }

  function convertExternal(e: ExternalEntry, nextId: number): Entry | null {
    const projectName = (e.projectName || e.project || '').trim();
    const clientName  = (e.clientName  || e.client  || '').trim();
    const task        = (e.taskDescription || e.task || 'Untitled').trim();

    const proj = resolveProject(projectName, clientName);
    if (!proj) return null;

    const hours: Record<string, number> = {};
    if (!e.isMeeting && e.hours) {
      for (const h of e.hours) {
        const initials = (h.initials || h.member || '').trim();
        const id = initToMemberId[initials.toLowerCase()];
        if (id && Number(h.hours) > 0) hours[id] = Number(h.hours);
      }
    }

    return {
      id:              nextId,
      date:            e.date,
      projectId:       proj.id,
      type:            e.isMeeting ? 'meeting' : 'task',
      task,
      billing:         toBilling(e.billingType ?? proj.billing),
      hours,
      meetingDuration: e.isMeeting ? (e.meetingDuration ?? 1) : undefined,
      meetingPeople:   e.isMeeting ? (e.personCount ?? 2) : undefined,
      createdAt:       Date.now(),
      trashed:         false,
    };
  }

  /* ── Parse file ─────────────────────────────────────────── */

  function handleFile(file: File) {
    setStatus('parsing');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target!.result as string;
        const data = JSON.parse(text);
        const rawEntries: AnyEntry[] = Array.isArray(data)
          ? data
          : Array.isArray(data.entries)
            ? data.entries
            : null;

        if (!rawEntries || rawEntries.length === 0) {
          throw new Error('No entries found in file');
        }

        let nextId = Date.now();

        const preview: PreviewRow[] = rawEntries.map(raw => {
          if (isExternal(raw)) {
            const converted = convertExternal(raw, nextId++);
            const projectName = (raw.projectName || raw.project || '').trim();
            const clientName  = (raw.clientName  || raw.client  || '').trim();
            const task        = (raw.taskDescription || raw.task || '').trim();

            if (!converted) {
              return {
                raw, converted: null,
                status: 'unknown' as EntryStatus,
                projectLabel: projectName || 'Unknown Project',
                clientLabel:  clientName,
                taskLabel:    task,
                displayHours: calcDisplayHours(raw),
              };
            }

            const status: EntryStatus = isDuplicate(converted, existingEntries) ? 'duplicate' : 'new';

            return {
              raw, converted,
              status,
              projectLabel: projectById[converted.projectId]?.name ?? projectName,
              clientLabel:  clientName,
              taskLabel:    task,
              displayHours: calcDisplayHours(raw),
            };
          }

          // Internal entry format
          const ie = raw as Entry;
          const proj = projectById[ie.projectId];
          const status: EntryStatus = isDuplicate(ie, existingEntries) ? 'duplicate' : 'new';

          return {
            raw: ie, converted: ie,
            status,
            projectLabel: proj?.name ?? ie.projectId,
            clientLabel:  proj?.clientName ?? '',
            taskLabel:    ie.task,
            displayHours: calcDisplayHours(ie),
          };
        });

        const newIdxs = new Set(
          preview.map((_, i) => i).filter(i => preview[i].status === 'new')
        );
        setRows(preview);
        setSelected(newIdxs);
        setStatus('preview');

      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not parse file.');
        setStatus('error');
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function toggleRow(i: number) {
    if (rows[i].status === 'unknown') return;
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  /* ── Confirm ─────────────────────────────────────────────── */

  async function handleConfirm() {
    setStatus('importing');

    const toImport: Entry[] = Array.from(selected)
      .map(i => rows[i].converted)
      .filter((e): e is Entry => e !== null);

    onImport(toImport);

    const externalRows = Array.from(selected)
      .map(i => rows[i])
      .filter(r => isExternal(r.raw) && r.converted !== null)
      .map(r => r.raw as ExternalEntry);

    if (externalRows.length > 0) {
      try {
        const res = await fetch('/api/import', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ entries: externalRows, skipDuplicates: true }),
        });
        const data = await res.json() as { imported: number; skipped: number; errors: string[] };
        if (data.errors?.length) setApiErrors(data.errors);
      } catch {
        setApiErrors(['Could not save to database. Entries shown but may not persist after refresh.']);
      }
    }

    setStatus('done');
  }

  /* ── Counts ──────────────────────────────────────────────── */

  const newCount     = rows.filter(r => r.status === 'new').length;
  const dupCount     = rows.filter(r => r.status === 'duplicate').length;
  const unknownCount = rows.filter(r => r.status === 'unknown').length;
  const selCount     = selected.size;

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="modal-scrim" style={{ zIndex: 550 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="modal-h">
          <h2>Import entries</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-body">

          {/* Idle / Error */}
          {(status === 'idle' || status === 'error') && (
            <>
              <div
                className={'dropzone' + (isDragOver ? ' over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
              >
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none"
                  style={{ margin: '0 auto 12px', display: 'block' }}>
                  <rect x="10" y="6" width="28" height="36" rx="3" stroke="currentColor"
                    strokeWidth="1.5" fill="none" opacity="0.5"/>
                  <rect x="18" y="2" width="28" height="36" rx="3" stroke="currentColor"
                    strokeWidth="1.5" fill="none" opacity="0.3"/>
                  <path d="M22 24l8 8 8-8" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                  <line x1="30" y1="18" x2="30" y2="32" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
                  <line x1="22" y1="35" x2="38" y2="35" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                </svg>
                <h3>Drop your Chronicle backup here</h3>
                <p>or click to choose a file</p>
                <div className="formats">Accepts · .json (Chronicle backup)</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              {status === 'error' && (
                <div className="import-error">
                  <IconWarn size={14} /> {errorMsg}
                </div>
              )}
            </>
          )}

          {/* Parsing / Importing */}
          {(status === 'parsing' || status === 'importing') && (
            <div className="import-loading">
              {status === 'parsing' ? 'Parsing file…' : 'Importing entries…'}
            </div>
          )}

          {/* Done */}
          {status === 'done' && (
            <div className="import-done">
              <div className="import-done-ring"><IconCheck size={32} /></div>
              <p className="import-done-msg">
                {selCount} {selCount === 1 ? 'entry' : 'entries'} imported successfully.
              </p>
              {unknownCount > 0 && (
                <div className="import-error" style={{ marginTop: 10 }}>
                  <IconWarn size={14} />
                  {unknownCount} {unknownCount === 1 ? 'entry was' : 'entries were'} skipped —
                  project not found in Chronicle.
                </div>
              )}
              {apiErrors.map((e, i) => (
                <div key={i} className="import-error" style={{ marginTop: 6 }}>
                  <IconWarn size={12} /> {e}
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {status === 'preview' && (
            <>
              <div className="import-summary">
                <span className="status-tag new">{newCount} new</span>
                {dupCount > 0 && <span className="status-tag dup">{dupCount} duplicate</span>}
                {unknownCount > 0 && (
                  <span className="status-tag unknown" style={{
                    background: 'var(--warning-bg, #fef3c7)',
                    color: 'var(--warning-text, #92400e)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {unknownCount} unknown project
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)' }}>
                  {selCount} selected
                </span>
              </div>

              {rows.length === 0 ? (
                <div className="empty" style={{ padding: 40 }}>
                  <h3>No entries found</h3>
                  <p>Make sure the file is a valid Chronicle JSON backup.</p>
                </div>
              ) : (
                <table className="ts-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th style={{ width: 90 }}>Date</th>
                      <th style={{ width: 180 }}>Project</th>
                      <th>Task</th>
                      <th className="num" style={{ width: 60 }}>Hours</th>
                      <th style={{ width: 90 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isSel     = selected.has(i);
                      const isUnknown = row.status === 'unknown';
                      const proj      = row.converted ? (projectById[row.converted.projectId] as ProjectWithMeta | undefined) : null;
                      const h         = row.displayHours;
                      const isMtg     = isExternal(row.raw)
                        ? (row.raw as ExternalEntry).isMeeting
                        : (row.raw as Entry).type === 'meeting';

                      return (
                        <tr
                          key={i}
                          className="entry"
                          onClick={() => toggleRow(i)}
                          style={{
                            opacity: (row.status === 'duplicate' || isUnknown) ? 0.5 : 1,
                            cursor: isUnknown ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <td>
                            {!isUnknown && <div className={`row-checkbox${isSel ? ' checked' : ''}`} />}
                          </td>
                          <td className="mono" style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
                            {row.raw.date}
                          </td>
                          <td>
                            {proj ? (
                              <ProjectPill project={proj} clientName={proj.clientName} />
                            ) : (
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                color: isUnknown ? 'var(--warning-text, #92400e)' : 'var(--ink-ghost)',
                              }}>
                                {row.clientLabel ? `${row.clientLabel} · ` : ''}
                                {row.projectLabel}
                                {isUnknown && ' ⚠'}
                              </span>
                            )}
                          </td>
                          <td className="task-cell" style={{ fontSize: 12.5 }}>
                            {isMtg && <span className="meet">Meeting</span>}
                            {row.taskLabel}
                          </td>
                          <td className="hrs">
                            <span className="v">{h % 1 === 0 ? h : h.toFixed(1)}</span>
                            <span className="u">h</span>
                          </td>
                          <td>
                            {isUnknown ? (
                              <span className="status-tag" style={{
                                background: 'var(--warning-bg, #fef3c7)',
                                color: 'var(--warning-text, #92400e)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontFamily: 'var(--font-mono)',
                              }}>
                                Unknown
                              </span>
                            ) : (
                              <span className={`status-tag ${row.status}`}>
                                {row.status === 'new' ? 'New' : 'Duplicate'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {unknownCount > 0 && (
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)' }}>
                  ⚠ Unknown project rows cannot be imported.
                  Add the project in Settings → Clients &amp; Projects first.
                </p>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer">
          {status === 'preview' && (
            <>
              <button className="btn btn-ghost" onClick={() => { setStatus('idle'); setRows([]); setSelected(new Set()); }}>
                Back
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={selCount === 0}
                style={{ opacity: selCount === 0 ? 0.45 : 1 }}
              >
                <IconCheck size={14} />
                Import {selCount} {selCount === 1 ? 'entry' : 'entries'}
              </button>
            </>
          )}
          {(status === 'idle' || status === 'error') && (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          )}
          {status === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>
              <IconCheck size={14} /> Done
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
