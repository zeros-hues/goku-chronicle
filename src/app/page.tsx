'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Timesheet from '@/components/Timesheet';
import Dashboard from '@/components/Dashboard';
import ExportPage from '@/components/ExportPage';
import TrashPage from '@/components/TrashPage';
import SettingsPage from '@/components/SettingsPage';
import EntryDrawer from '@/components/NewEntryDrawer';
import ImportModal from '@/components/ImportModal';
import ShortcutsDialog from '@/components/ShortcutsDialog';
import ActivityPanel from '@/components/ActivityPanel';
import { dowFull, monShort } from '@/lib/data';
import type { View, Theme, Entry, Client, Member, ActivityEvent } from '@/lib/data';
import * as api from '@/lib/api';
import { IconPlus, IconImport, IconTimesheet, IconDashboard, IconCheck } from '@/components/Icons';

/* ── Toast types ─────────────────────────────────────────── */
interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; cb: () => void };
}

let toastSeq = 0;
let activitySeq = 0;

function getTopBar(view: View): { title: string; sub: string } {
  const d = new Date();
  const dateStr = `${dowFull(d)}, ${d.getDate()} ${monShort(d)} ${d.getFullYear()}`;
  if (view === 'timesheet') return { title: 'Timesheet', sub: `Today is ${dateStr}` };
  if (view === 'dashboard') return { title: 'Dashboard', sub: 'How the studio is spending its hours' };
  if (view === 'export')    return { title: 'Export',    sub: 'Send hours out as CSV or print' };
  if (view === 'trash')     return { title: 'Trash',     sub: 'Soft-deleted entries' };
  if (view === 'clients')   return { title: 'Settings',  sub: 'Clients & Projects' };
  if (view === 'team')      return { title: 'Settings',  sub: 'Team Members' };
  if (view === 'account')   return { title: 'Settings',  sub: 'Account & preferences' };
  return { title: view, sub: '' };
}

/* ── Placeholder member for sidebar before session loads ──── */
const PLACEHOLDER_USER: Member = {
  id: '',
  name: '…',
  init: '?',
  avatarClass: 'av-0',
  color: 'var(--ink-ghost)',
  active: true,
  wa: '',
};

export default function Page() {
  const { data: session }        = useSession();
  const [view, setView]          = useState<View>('timesheet');
  const [theme, setTheme]        = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('chronicle-theme') as Theme) ?? 'light';
    }
    return 'light';
  });

  const [entries, setEntries]    = useState<Entry[]>([]);
  const [clients, setClients]    = useState<Client[]>([]);
  const [members, setMembers]    = useState<Member[]>([]);
  const [holidays, setHolidays]  = useState<Record<string, string>>({});
  const [hoursTarget, setHoursTarget] = useState(8);
  const [loading, setLoading]    = useState(true);
  const [dataError, setDataError] = useState(false);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editEntry, setEditEntry]   = useState<Entry | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newEntryId, setNewEntryId] = useState<number | null>(null);
  const [toasts, setToasts]         = useState<ToastItem[]>([]);
  const toastTimers                 = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [activityLog, setActivityLog]   = useState<ActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [activityLastViewed, setActivityLastViewed] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('chronicle-activity-last-viewed') || '0', 10);
    }
    return 0;
  });
  const searchRef                   = useRef<HTMLInputElement>(null);

  const trashCount = entries.filter(e => e.trashed).length;

  /* ── Initial data load ─────────────────────────────────── */
  async function loadAll() {
    setDataError(false);
    setLoading(true);
    try {
      const [active, trashed, fetchedClients, fetchedMembers, account] = await Promise.all([
        api.fetchEntries(),
        api.fetchTrash(),
        api.fetchClients(),
        api.fetchMembers(),
        api.fetchAccount(),
      ]);
      setEntries([...active, ...trashed]);
      setClients(fetchedClients);
      setMembers(fetchedMembers);
      setHoursTarget(account.hoursTarget);

      const hmap: Record<string, string> = {};
      for (const h of account.holidays) {
        hmap[h.date.slice(0, 10)] = h.label ?? '';
      }
      setHolidays(hmap);
    } catch {
      setDataError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  /* ── Theme persistence ─────────────────────────────────── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chronicle-theme', theme);
  }, [theme]);

  /* ── Toast + activity system ───────────────────────────── */
  const showToast = useCallback((
    text: string,
    action?: { label: string; cb: () => void },
    duration?: number,
  ) => {
    const id = ++toastSeq;
    setToasts(prev => [...prev.slice(-2), { id, text, action }]);
    const ms = duration ?? (action ? 6000 : 4000);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimers.current.delete(id);
    }, ms);
    toastTimers.current.set(id, timer);
    const aid = ++activitySeq;
    setActivityLog(prev => [{ id: aid, text, ts: Date.now() }, ...prev].slice(0, 100));
  }, []);

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) { clearTimeout(timer); toastTimers.current.delete(id); }
  }

  /* ── Entry CRUD ────────────────────────────────────────── */
  async function handleSave(entry: Entry) {
    setEntries(prev => [entry, ...prev]);
    setNewEntryId(entry.id);
    try {
      const saved = await api.createEntry(entry);
      setEntries(prev => prev.map(e => e.id === entry.id ? saved : e));
      setNewEntryId(saved.id);
      const proj = projectById[saved.projectId];
      const projName = proj?.name ?? saved.projectId;
      const taskLabel = saved.task.length > 30 ? saved.task.slice(0, 30) + '…' : saved.task;
      showToast(`Entry saved — ${projName} · ${taskLabel}`);
      setTimeout(() => setNewEntryId(null), 3000);
    } catch {
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      showToast('Failed to save entry');
    }
  }

  async function handleUpdate(updatedEntry: Entry) {
    setEntries(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
    setNewEntryId(updatedEntry.id);
    try {
      const saved = await api.updateEntry(updatedEntry);
      setEntries(prev => prev.map(e => e.id === updatedEntry.id ? saved : e));
      setNewEntryId(saved.id);
      showToast('Entry updated');
      setTimeout(() => setNewEntryId(null), 3000);
    } catch {
      showToast('Failed to update entry');
    }
  }

  async function handleTrash(ids: Set<number>) {
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: true } : e));
    try {
      await api.trashEntries(Array.from(ids));
    } catch {
      setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: false } : e));
      showToast('Failed to trash entries');
    }
  }

  async function handleRestore(ids: Set<number>) {
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: false } : e));
    try {
      await api.restoreEntries(Array.from(ids));
    } catch {
      setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: true } : e));
      showToast('Failed to restore entries');
    }
  }

  async function handleDelete(ids: Set<number>) {
    setEntries(prev => prev.filter(e => !ids.has(e.id)));
    try {
      await api.permanentDeleteEntries(Array.from(ids));
    } catch {
      showToast('Failed to permanently delete entries');
    }
  }

  async function handleImport(newEntries: Entry[]) {
    try {
      const memberById = Object.fromEntries(members.map(m => [m.id, m]));
      const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientId: c.id, clientName: c.name })));
      const projectById = Object.fromEntries(allProjects.map(p => [p.id, p]));
      const result = await api.importEntries(newEntries, memberById, projectById);
      const [active, trashed] = await Promise.all([api.fetchEntries(), api.fetchTrash()]);
      setEntries([...active, ...trashed]);
      const n = result.imported;
      showToast(`${n} ${n === 1 ? 'entry' : 'entries'} imported`);
    } catch {
      showToast('Import failed');
    }
  }

  function handleEdit(entry: Entry) {
    setEditEntry(entry);
    setShowDrawer(true);
  }

  function handleDrawerClose() {
    setShowDrawer(false);
    setEditEntry(undefined);
  }

  function handleDrawerSave(entry: Entry) {
    if (editEntry) {
      handleUpdate(entry);
    } else {
      handleSave(entry);
    }
  }

  /* ── Global keyboard shortcuts ─────────────────────────── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        if (showDrawer) { handleDrawerClose(); return; }
        if (showImport) { setShowImport(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showActivity) { setShowActivity(false); return; }
      }

      if (inInput) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (view === 'timesheet' || view === 'dashboard') {
          e.preventDefault();
          setEditEntry(undefined);
          setShowDrawer(true);
        }
        return;
      }

      if (e.key === '/') {
        if (view === 'timesheet') {
          e.preventDefault();
          searchRef.current?.focus();
        }
        return;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, showDrawer, showImport, showShortcuts, showActivity]);

  function openActivity() {
    setShowActivity(true);
    const now = Date.now();
    setActivityLastViewed(now);
    localStorage.setItem('chronicle-activity-last-viewed', String(now));
  }

  const activityCount = activityLog.filter(e => e.ts > activityLastViewed).length;

  /* ── Derived data ──────────────────────────────────────── */
  const activeMembers = members.filter(m => m.active);
  const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, clientId: c.id, clientName: c.name })));
  const projectById = Object.fromEntries(allProjects.map(p => [p.id, p]));

  const currentUser: Member = session?.user
    ? (members.find(m => m.name === session.user?.name) ?? {
        id: '',
        name: session.user.name ?? 'Admin',
        init: (session.user.name ?? 'A').slice(0, 1).toUpperCase(),
        avatarClass: 'av-0',
        color: 'var(--ink-ghost)',
        active: true,
        wa: '',
      })
    : PLACEHOLDER_USER;

  const { title, sub } = getTopBar(view);
  const isTimesheetOrDash = view === 'timesheet' || view === 'dashboard';

  const topBarActions = (
    <>
      {isTimesheetOrDash && (
        <div className="view-segments">
          <button className={view === 'timesheet' ? 'active' : ''} onClick={() => setView('timesheet')}>
            <IconTimesheet size={13} /><span>Timesheet</span>
          </button>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <IconDashboard size={13} /><span>Dashboard</span>
          </button>
        </div>
      )}
      {view === 'timesheet' && (
        <button className="btn" onClick={() => setShowImport(true)}>
          <IconImport size={14} /> Import
        </button>
      )}
      {isTimesheetOrDash && (
        <button className="btn btn-accent" onClick={() => { setEditEntry(undefined); setShowDrawer(true); }}>
          <IconPlus size={14} /> New entry
        </button>
      )}
    </>
  );

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setView}
        theme={theme}
        setTheme={setTheme}
        trashCount={trashCount}
        currentUser={currentUser}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
        activityCount={activityCount}
        onActivityClick={openActivity}
      />
      <div className="main-area">
        <TopBar title={title} sub={sub} actions={topBarActions} />

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Loading…
          </div>
        ) : dataError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
            <p style={{ color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              Could not load data. Check your connection.
            </p>
            <button className="btn" onClick={loadAll}>Retry</button>
          </div>
        ) : view === 'timesheet' ? (
          <Timesheet
            entries={entries}
            clients={clients}
            members={activeMembers}
            projectById={projectById}
            onTrash={handleTrash}
            onRestore={handleRestore}
            onEdit={handleEdit}
            showToast={showToast}
            newEntryId={newEntryId}
            searchRef={searchRef}
          />
        ) : view === 'dashboard' ? (
          <Dashboard
            entries={entries}
            members={activeMembers}
            projectById={projectById}
            holidays={holidays}
            hoursTarget={hoursTarget}
          />
        ) : view === 'export' ? (
          <ExportPage
            entries={entries}
            clients={clients}
            members={activeMembers}
            projectById={projectById}
            showToast={showToast}
          />
        ) : view === 'trash' ? (
          <TrashPage
            entries={entries}
            members={activeMembers}
            projectById={projectById}
            onRestore={handleRestore}
            onDelete={handleDelete}
            showToast={showToast}
          />
        ) : (view === 'clients' || view === 'team' || view === 'account') ? (
          <SettingsPage
            section={view}
            onNavigate={setView}
            showToast={showToast}
            onClientsChange={setClients}
            onMembersChange={setMembers}
            onHolidaysChange={setHolidays}
          />
        ) : null}
      </div>

      {showDrawer && (
        <EntryDrawer
          entry={editEntry}
          clients={clients}
          members={activeMembers}
          onClose={handleDrawerClose}
          onSave={handleDrawerSave}
        />
      )}

      {showImport && (
        <ImportModal
          existingEntries={entries}
          clients={clients}
          members={members}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {showShortcuts && (
        <ShortcutsDialog onClose={() => setShowShortcuts(false)} />
      )}

      {showActivity && (
        <ActivityPanel
          events={activityLog}
          onClose={() => setShowActivity(false)}
        />
      )}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className="toast">
              <span style={{ color: 'var(--ok)', flexShrink: 0, display: 'flex' }}><IconCheck size={13} /></span>
              <span>{t.text}</span>
              {t.action && (
                <button onClick={() => { t.action!.cb(); dismissToast(t.id); }}>
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismissToast(t.id)} style={{ marginLeft: 'auto', opacity: 0.5, padding: '0 4px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
