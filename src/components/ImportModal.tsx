'use client';

import { useState, useRef, useMemo, Fragment } from 'react';
import type { Entry, Client, Member, BillingType, Project } from '@/lib/data';
import ProjectPill from './ProjectPill';
import ImportProgress from './ImportProgress';
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

function toBillingAPI(b: BillingType): string {
  if (b === 'retainer') return 'RETAINERSHIP';
  if (b === 'out') return 'OUT_OF_RETAINERSHIP';
  return 'INTERNAL';
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
  raw:             AnyEntry;
  converted:       Entry | null;
  status:          EntryStatus;
  projectLabel:    string;
  clientLabel:     string;
  taskLabel:       string;
  displayHours:    number;
  resolvedProject?: ProjectWithMeta;
}

interface ImportModalProps {
  existingEntries: Entry[];
  clients: Client[];
  members: Member[];
  onImport: (entries: Entry[]) => Promise<void>;
  onClose: () => void;
}

/* ── Inline add-project form ─────────────────────────────────── */

interface InlineAddProjectProps {
  originalProjectName: string;
  clientName: string;
  allClients: Client[];
  onResolved: (proj: ProjectWithMeta) => void;
  onCancel: () => void;
  onNewClientCreated: (client: Client) => void;
}

function InlineAddProject({ originalProjectName, clientName, allClients, onResolved, onCancel, onNewClientCreated }: InlineAddProjectProps) {
  const matchedClient = allClients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
  const [formName, setFormName]           = useState(originalProjectName);
  const [clientId, setClientId]           = useState<string>(matchedClient?.id ?? '');
  const [billing, setBilling]             = useState<BillingType>('retainer');
  const [newClientName, setNewClientName] = useState(clientName);
  const [saving, setSaving]               = useState(false);
  const [err, setErr]                     = useState('');

  async function handleAdd() {
    if (!formName.trim()) { setErr('Project name is required.'); return; }
    if (!clientId) { setErr('Please select a client.'); return; }
    if (clientId === 'new' && !newClientName.trim()) { setErr('Client name is required.'); return; }
    setSaving(true);
    setErr('');

    let resolvedClientId   = clientId;
    let resolvedClientName = allClients.find(c => c.id === clientId)?.name ?? '';

    if (clientId === 'new') {
      try {
        const res = await fetch('/api/settings/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newClientName.trim(), hasRetainership: billing === 'retainer' }),
        });
        if (!res.ok) throw new Error('Failed to create client');
        const raw = await res.json();
        const newClient: Client = { ...raw, projects: raw.projects ?? [] };
        onNewClientCreated(newClient);
        resolvedClientId   = newClient.id;
        resolvedClientName = newClient.name;
      } catch {
        setErr('Failed to create client. Try again.');
        setSaving(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/settings/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), clientId: resolvedClientId, billingType: toBillingAPI(billing) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create project');
      }
      const created = await res.json();
      onResolved({
        id:         created.id,
        name:       created.name,
        color:      created.color ?? 'oklch(0.65 0.13 200)',
        billing:    toBilling(created.billing),
        archivedAt: null,
        clientId:   resolvedClientId,
        clientName: resolvedClientName,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create project');
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={6} style={{ padding: '12px 16px 14px', background: 'var(--paper-raised, color-mix(in oklch, var(--paper) 85%, var(--ink) 3%))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Add project to resolve
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', textTransform: 'uppercase' }}>Project name</label>
              <input
                className="input"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                style={{ width: 180 }}
                disabled={saving}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', textTransform: 'uppercase' }}>Client</label>
              <select
                className="input"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                style={{ width: 160 }}
                disabled={saving}
              >
                <option value="">— Select client —</option>
                {allClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="new">+ New client</option>
              </select>
            </div>
            {clientId === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', textTransform: 'uppercase' }}>New client name</label>
                <input
                  className="input"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Client name"
                  style={{ width: 160 }}
                  disabled={saving}
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-fade)', textTransform: 'uppercase' }}>Billing</label>
              <div className="seg" style={{ height: 32, display: 'flex' }}>
                {(['retainer', 'out', 'internal'] as BillingType[]).map(b => (
                  <button key={b} type="button" className={`seg-btn${billing === b ? ' active' : ''}`}
                    onClick={() => setBilling(b)} disabled={saving}>
                    {b === 'retainer' ? 'Retainer' : b === 'out' ? 'Out' : 'Internal'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding…' : 'Add & resolve'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
          {err && (
            <div style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconWarn size={12} /> {err}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── ImportModal ─────────────────────────────────────────────── */

export default function ImportModal({ existingEntries, clients, members, onImport, onClose }: ImportModalProps) {
  const [status,            setStatus]           = useState<ImportStatus>('idle');
  const [isDragOver,        setDrag]             = useState(false);
  const [rows,              setRows]             = useState<PreviewRow[]>([]);
  const [selected,          setSelected]         = useState<Set<number>>(new Set());
  const [errorMsg,          setError]            = useState('');
  const [apiErrors,         setApiErrors]        = useState<string[]>([]);
  const [resolveOpen,       setResolveOpen]      = useState<Set<number>>(new Set());
  const [extraClients,      setExtraClients]     = useState<Client[]>([]);
  const [importingEntries,  setImportingEntries] = useState<Entry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { allProjects, projectById, initToMemberId } = useMemo(() => {
    const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientId: c.id, clientName: c.name })));
    const projectById = Object.fromEntries(allProjects.map(p => [p.id, p]));
    const initToMemberId: Record<string, string> = {};
    for (const m of members) initToMemberId[m.init.toLowerCase()] = m.id;
    return { allProjects, projectById, initToMemberId };
  }, [clients, members]);

  const allClientsForForm = useMemo(() => [...clients, ...extraClients], [clients, extraClients]);

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

        const newIdxs = new Set(preview.map((_, i) => i).filter(i => preview[i].status === 'new'));
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

  /* ── Inline project resolution ───────────────────────────── */

  function handleProjectResolved(rowIdx: number, originalName: string, proj: ProjectWithMeta) {
    // Compute indices to auto-select from current rows before any state updates
    const toAutoSelect = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => {
        if (r.status !== 'unknown' || !isExternal(r.raw)) return false;
        const raw = r.raw as ExternalEntry;
        return (raw.projectName || raw.project || '').trim().toLowerCase() === originalName.toLowerCase();
      })
      .map(({ i }) => i);

    setRows(prev => prev.map((row, i) => {
      if (row.status !== 'unknown' || !isExternal(row.raw)) return row;
      const raw = row.raw as ExternalEntry;
      const rowProjName = (raw.projectName || raw.project || '').trim();
      if (rowProjName.toLowerCase() !== originalName.toLowerCase()) return row;

      const task = (raw.taskDescription || raw.task || 'Untitled').trim();
      const hours: Record<string, number> = {};
      if (!raw.isMeeting && raw.hours) {
        for (const h of raw.hours) {
          const initials = (h.initials || h.member || '').trim();
          const id = initToMemberId[initials.toLowerCase()];
          if (id && Number(h.hours) > 0) hours[id] = Number(h.hours);
        }
      }
      const converted: Entry = {
        id:              Date.now() + i,
        date:            raw.date,
        projectId:       proj.id,
        type:            raw.isMeeting ? 'meeting' : 'task',
        task,
        billing:         toBilling(raw.billingType ?? proj.billing),
        hours,
        meetingDuration: raw.isMeeting ? (raw.meetingDuration ?? 1) : undefined,
        meetingPeople:   raw.isMeeting ? (raw.personCount ?? 2) : undefined,
        createdAt:       Date.now(),
        trashed:         false,
      };
      const newStatus: EntryStatus = isDuplicate(converted, existingEntries) ? 'duplicate' : 'new';
      return { ...row, status: newStatus, converted, projectLabel: proj.name, clientLabel: proj.clientName, resolvedProject: proj };
    }));

    setSelected(prev => {
      const next = new Set(prev);
      for (const i of toAutoSelect) next.add(i);
      return next;
    });

    setResolveOpen(prev => { const n = new Set(prev); n.delete(rowIdx); return n; });
  }

  /* ── Confirm ─────────────────────────────────────────────── */

  async function handleConfirm() {
    const toImport: Entry[] = Array.from(selected)
      .map(i => rows[i].converted)
      .filter((e): e is Entry => e !== null);
    setImportingEntries(toImport);
    setStatus('importing');
    try {
      await onImport(toImport);
    } catch {
      setApiErrors(['Could not save to database. Entries shown but may not persist after refresh.']);
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

          {/* Parsing */}
          {status === 'parsing' && (
            <div className="import-loading">Parsing file…</div>
          )}

          {/* Importing */}
          {status === 'importing' && (
            <ImportProgress entries={importingEntries} />
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
                      <th style={{ width: 120 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isSel     = selected.has(i);
                      const isUnknown = row.status === 'unknown';
                      const isOpen    = resolveOpen.has(i);
                      const proj      = row.resolvedProject
                        ?? (row.converted ? (projectById[row.converted.projectId] as ProjectWithMeta | undefined) : null);
                      const h         = row.displayHours;
                      const isMtg     = isExternal(row.raw)
                        ? (row.raw as ExternalEntry).isMeeting
                        : (row.raw as Entry).type === 'meeting';

                      return (
                        <Fragment key={i}>
                          <tr
                            className="entry"
                            onClick={() => toggleRow(i)}
                            style={{
                              opacity: (row.status === 'duplicate' || isUnknown) ? 0.6 : 1,
                              cursor: isUnknown ? 'default' : 'pointer',
                              background: isOpen ? 'var(--paper-raised, color-mix(in oklch, var(--paper) 85%, var(--ink) 3%))' : undefined,
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
                                isOpen ? (
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
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 11, color: 'var(--warning-text, #d97706)', whiteSpace: 'nowrap' }}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setResolveOpen(prev => { const n = new Set(prev); n.add(i); return n; });
                                    }}
                                  >
                                    ⚠ Add project
                                  </button>
                                )
                              ) : (
                                <span className={`status-tag ${row.status}`}>
                                  {row.status === 'new' ? 'New' : 'Duplicate'}
                                </span>
                              )}
                            </td>
                          </tr>
                          {isUnknown && isOpen && (
                            <InlineAddProject
                              originalProjectName={row.projectLabel}
                              clientName={row.clientLabel}
                              allClients={allClientsForForm}
                              onResolved={proj => handleProjectResolved(i, row.projectLabel, proj)}
                              onCancel={() => setResolveOpen(prev => { const n = new Set(prev); n.delete(i); return n; })}
                              onNewClientCreated={c => setExtraClients(prev => [...prev, c])}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer">
          {status === 'preview' && (
            <>
              <button className="btn btn-ghost" onClick={() => { setStatus('idle'); setRows([]); setSelected(new Set()); setResolveOpen(new Set()); }}>
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
