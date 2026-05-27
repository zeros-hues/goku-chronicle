'use client';

import { useState, useEffect } from 'react';
import { fmtDate } from '@/lib/data';
import type { Entry, BillingType, Client, Member } from '@/lib/data';
import { IconX, IconCheck, IconCalendar, IconWarn } from './Icons';

const DRAFT_NEW_KEY     = 'chronicle-draft-new-entry';
const RECENT_PROJ_KEY   = 'chronicle-recent-projects';
const DRAFT_TTL         = 24 * 60 * 60 * 1000; // 24 h

interface DraftData {
  date: string;
  type: 'task' | 'meeting';
  projectId: string;
  task: string;
  hours: Record<string, string>;
  meetingDuration: string;
  meetingPeople: string;
}

interface Draft {
  data: DraftData;
  savedAt: number;
  expiresAt: number;
}

interface EntryDrawerProps {
  entry?: Entry;
  clients: Client[];
  members: Member[];
  onClose: () => void;
  onSave: (entry: Entry) => void;
}

/* ── localStorage helpers ───────────────────────────────── */
function safeSave(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function safeLoad<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function loadDraft(key: string): Draft | null {
  const d = safeLoad<Draft>(key);
  if (!d) return null;
  if (Date.now() > d.expiresAt) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
  return d;
}

function saveDraft(key: string, data: DraftData) {
  const now = Date.now();
  safeSave(key, { data, savedAt: now, expiresAt: now + DRAFT_TTL });
}

function clearDraftKey(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/* ── Recently used projects ─────────────────────────────── */
function addRecentProject(projectId: string) {
  const recent = safeLoad<string[]>(RECENT_PROJ_KEY) ?? [];
  const updated = [projectId, ...recent.filter(id => id !== projectId)].slice(0, 5);
  safeSave(RECENT_PROJ_KEY, updated);
}

function getRecentProjects(): string[] {
  return safeLoad<string[]>(RECENT_PROJ_KEY) ?? [];
}

/* ── Time-ago helper ────────────────────────────────────── */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return 'yesterday';
  if (hrs  >= 1) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  if (mins >= 1) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  return 'just now';
}

/* ── Helpers ─────────────────────────────────────────────── */
function initHoursStr(hours: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, v > 0 ? String(v) : '']));
}

export default function EntryDrawer({ entry, clients, members, onClose, onSave }: EntryDrawerProps) {
  const isEdit   = !!entry;
  const draftKey = isEdit ? `chronicle-draft-edit-entry-${entry!.id}` : DRAFT_NEW_KEY;
  const draft    = loadDraft(draftKey);
  const today    = fmtDate(new Date());

  const activeClients = clients.map(c => ({
    ...c,
    projects: c.projects.filter(p => !p.archivedAt),
  })).filter(c => c.projects.length > 0 || clients.find(x => x.id === c.id));

  const allProjects  = clients.flatMap(c => c.projects.map(p => ({ ...p, clientId: c.id })));
  const projectById  = Object.fromEntries(allProjects.map(p => [p.id, p]));

  /* ── State — initialized from entry (edit) or draft (new) ─ */
  const [date, setDate]               = useState(() => isEdit ? entry!.date           : draft?.data.date            ?? today);
  const [type, setType]               = useState<'task' | 'meeting'>(() => isEdit ? entry!.type  : draft?.data.type ?? 'task');
  const [projectId, setProjectIdRaw]  = useState(() => isEdit ? entry!.projectId      : draft?.data.projectId       ?? '');
  const [task, setTask]               = useState(() => isEdit ? entry!.task           : draft?.data.task            ?? '');
  const [hours, setHours]             = useState<Record<string, string>>(() =>
    isEdit ? initHoursStr(entry!.hours) : draft?.data.hours ?? {}
  );
  const [meetingDuration, setDuration] = useState(() =>
    isEdit ? String(entry!.meetingDuration ?? '') : draft?.data.meetingDuration ?? ''
  );
  const [meetingPeople, setPeople]    = useState(() =>
    isEdit ? String(entry!.meetingPeople ?? '') : draft?.data.meetingPeople ?? ''
  );

  const hasMeaningfulDraft = !!(draft && (draft.data.task?.trim() || draft.data.projectId));
  const [draftBanner, setDraftBanner] = useState<Draft | null>(
    isEdit ? (hasMeaningfulDraft ? draft : null) : (hasMeaningfulDraft ? draft : null)
  );
  const [flash, setFlash]             = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => getRecentProjects());

  /* ── Project selector with recent tracking ──────────────── */
  function setProjectId(id: string) {
    setProjectIdRaw(id);
    if (id) {
      addRecentProject(id);
      setRecentProjects(getRecentProjects());
    }
  }

  /* ── Auto-save draft every 2 s while form has data ─────── */
  useEffect(() => {
    const hasData = task.trim().length > 0 || !!projectId;
    if (!hasData) return;

    const data: DraftData = { date, type, projectId, task, hours, meetingDuration, meetingPeople };
    const timer = setInterval(() => saveDraft(draftKey, data), 2000);
    return () => clearInterval(timer);
  }, [draftKey, date, type, projectId, task, hours, meetingDuration, meetingPeople]);

  /* ── Derived ─────────────────────────────────────────────── */
  const selectedProj = projectById[projectId];
  const billing: BillingType = selectedProj?.billing ?? 'retainer';

  function canSave() {
    if (!projectId || !task.trim()) return false;
    if (type === 'task') return Object.values(hours).some(h => parseFloat(h) > 0);
    return parseFloat(meetingDuration) > 0 && parseInt(meetingPeople) > 0;
  }

  function buildEntry(): Entry {
    const base = isEdit ? entry! : { id: Date.now(), createdAt: Date.now() };
    return {
      ...base,
      date,
      projectId,
      type,
      task: task.trim(),
      billing: projectById[projectId]?.billing ?? billing,
      hours: type === 'task'
        ? Object.fromEntries(
            Object.entries(hours)
              .map(([k, v]) => [k, parseFloat(v) || 0])
              .filter(([, v]) => (v as number) > 0)
          )
        : {},
      ...(type === 'meeting' && {
        meetingDuration: parseFloat(meetingDuration),
        meetingPeople: parseInt(meetingPeople),
      }),
    };
  }

  function handleSave() {
    if (!canSave()) return;
    onSave(buildEntry());
    clearDraftKey(draftKey);
    setFlash(true);
    setTimeout(() => { setFlash(false); onClose(); }, 700);
  }

  function handleSaveAndAdd() {
    if (!canSave()) return;
    onSave(buildEntry());
    clearDraftKey(draftKey);
    setSessionCount(n => n + 1);
    setTask('');
    setHours({});
    setDuration('');
    setPeople('');
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }

  function setMeetingDuration(v: string) { setDuration(v); }
  function setMeetingPeople(v: string)   { setPeople(v);   }

  function handleDiscard() {
    clearDraftKey(draftKey);
    onClose();
  }

  function restoreDraft() {
    if (!draftBanner) return;
    const d = draftBanner.data;
    setDate(d.date ?? today);
    setType(d.type ?? 'task');
    setProjectIdRaw(d.projectId ?? '');
    setTask(d.task ?? '');
    setHours(d.hours ?? {});
    setDuration(d.meetingDuration ?? '');
    setPeople(d.meetingPeople ?? '');
    setDraftBanner(null);
  }

  function discardDraft() {
    clearDraftKey(draftKey);
    setDraftBanner(null);
    if (!isEdit) {
      setDate(today);
      setType('task');
      setProjectIdRaw('');
      setTask('');
      setHours({});
      setDuration('');
      setPeople('');
    }
  }

  /* ── Build recent + all project list ───────────────────── */
  const recentProjObjects = recentProjects
    .map(id => allProjects.find(p => p.id === id))
    .filter((p): p is typeof allProjects[number] => !!p && !p.archivedAt);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">

        {flash && (
          <div className="success-flash">
            <div className="ring"><IconCheck size={32} /></div>
          </div>
        )}

        <div className="drawer-header">
          <h2>{isEdit ? <>Edit <span className="i">entry</span>.</> : <>New <span className="i">entry</span>.</>}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="drawer-body">

          {draftBanner && (
            <div className="draft-banner">
              <IconWarn size={15} className="ic" />
              <div>
                <b>Unsaved draft found</b>
                <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  You have an unfinished entry from {timeAgo(draftBanner.savedAt)}.
                </div>
                <div className="acts">
                  <button className="primary" onClick={restoreDraft}>Restore draft</button>
                  <button onClick={discardDraft}>Start fresh</button>
                </div>
              </div>
            </div>
          )}

          {/* Date + Type */}
          <div className="form-row" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div>
              <label className="field-label">Date</label>
              <div className="date-input">
                <IconCalendar size={14} />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}
                />
              </div>
            </div>
            <div>
              <label className="field-label">Type</label>
              <div className="toggle-group">
                <button className={type === 'task' ? 'active' : ''} onClick={() => setType('task')}>Task</button>
                <button className={type === 'meeting' ? 'active' : ''} onClick={() => setType('meeting')}>Meeting</button>
              </div>
            </div>
          </div>

          {/* Project picker */}
          <div className="form-row">
            <label className="field-label">Project</label>
            {activeClients.length === 0 ? (
              <p style={{ color: 'var(--ink-fade)', fontSize: 13, margin: '8px 0' }}>
                No projects yet — add them in Settings → Clients &amp; Projects.
              </p>
            ) : (
              <>
                {recentProjObjects.length > 0 && (
                  <div className="proj-group">
                    <div className="proj-group-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-ghost)' }}>Recent</div>
                    <div className="proj-pills">
                      {recentProjObjects.map(proj => (
                        <button
                          key={proj.id}
                          className={'proj-pill-btn' + (projectId === proj.id ? ' selected' : '')}
                          onClick={() => setProjectId(proj.id)}
                        >
                          <span className="swatch" style={{ background: proj.color }} />
                          {proj.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeClients.map(client => {
                  const visibleProjects = client.projects.filter(p => !p.archivedAt);
                  if (visibleProjects.length === 0) return null;
                  return (
                    <div key={client.id} className="proj-group">
                      <div className="proj-group-title">{client.name}</div>
                      <div className="proj-pills">
                        {visibleProjects.map(proj => (
                          <button
                            key={proj.id}
                            className={'proj-pill-btn' + (projectId === proj.id ? ' selected' : '')}
                            onClick={() => setProjectId(proj.id)}
                          >
                            <span className="swatch" style={{ background: proj.color }} />
                            {proj.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Description */}
          <div className="form-row">
            <label className="field-label">Description</label>
            <textarea
              className="textarea"
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="What was worked on?"
              rows={3}
              autoFocus={!draftBanner}
            />
          </div>

          {/* Member hours */}
          {type === 'task' && (
            <div className="form-row">
              <label className="field-label">Hours per member</label>
              {members.length === 0 ? (
                <p style={{ color: 'var(--ink-fade)', fontSize: 13 }}>No team members — add them in Settings → Team Members.</p>
              ) : (
                members.map(m => {
                  const val = hours[m.id] ?? '';
                  const hasVal = parseFloat(val) > 0;
                  return (
                    <div key={m.id} className="member-row">
                      <span className="av" style={{ background: m.color }}>{m.init.slice(0, 1)}</span>
                      <span className="name">
                        {m.name}
                        <span className="init">{m.init}</span>
                      </span>
                      <div className={'hours-input' + (hasVal ? ' has-value' : '')}>
                        <input
                          type="number" min="0" max="24" step="0.5"
                          value={val} placeholder="0"
                          onChange={e => setHours(prev => ({ ...prev, [m.id]: e.target.value }))}
                        />
                        <span className="u">h</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Meeting fields */}
          {type === 'meeting' && (() => {
            const dur   = parseFloat(meetingDuration) || 0;
            const ppl   = parseInt(meetingPeople)     || 0;
            const total = dur > 0 && ppl > 0 ? dur * ppl : null;
            const totalDisplay = total !== null
              ? `${total % 1 === 0 ? total : total.toFixed(2).replace(/\.?0+$/, '')}h`
              : '—';
            return (
              <div className="form-row">
                <div className="meeting-total">
                  <span>Total</span>
                  <span className={total !== null ? 'v' : 'v empty'}>{totalDisplay}</span>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label className="field-label">Number of people</label>
                  <div className="picker-row">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <button key={n} type="button"
                        className={'picker-btn' + (ppl === n ? ' selected' : '')}
                        onClick={() => setMeetingPeople(String(n))}
                      >{n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="field-label">Duration</label>
                  <div className="picker-row">
                    {([
                      { label: '0.25h', value: 0.25 },
                      { label: '0.5h',  value: 0.5  },
                      { label: '0.75h', value: 0.75 },
                      { label: '1h',    value: 1    },
                      { label: '1.5h',  value: 1.5  },
                      { label: '2h',    value: 2    },
                      { label: '3h',    value: 3    },
                    ] as { label: string; value: number }[]).map(({ label, value }) => (
                      <button key={value} type="button"
                        className={'picker-btn' + (dur === value ? ' selected' : '')}
                        onClick={() => setMeetingDuration(String(value))}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleDiscard}>Discard</button>
            {sessionCount > 0 && (
              <span className="session-count">{sessionCount} added this session</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isEdit && (
              <button
                className="btn"
                onClick={handleSaveAndAdd}
                style={{ opacity: canSave() ? 1 : 0.45, cursor: canSave() ? 'pointer' : 'not-allowed' }}
                disabled={!canSave()}
              >
                Save & add another
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              style={{ opacity: canSave() ? 1 : 0.45, cursor: canSave() ? 'pointer' : 'not-allowed' }}
              disabled={!canSave()}
            >
              <IconCheck size={14} />
              {isEdit ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
