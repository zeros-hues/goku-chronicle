'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { MEMBERS, ENTRIES, TODAY, dowFull, monShort } from '@/lib/data';
import type { View, Theme, Entry } from '@/lib/data';
import { IconPlus, IconImport, IconTimesheet, IconDashboard, IconCheck } from '@/components/Icons';

/* ── Toast types ─────────────────────────────────────────── */
interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; cb: () => void };
}

let toastSeq = 0;

function getTopBar(view: View): { title: string; sub: string } {
  const d = TODAY;
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

export default function Page() {
  const [view, setView]           = useState<View>('timesheet');
  const [theme, setTheme]         = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('chronicle-theme') as Theme) ?? 'light';
    }
    return 'light';
  });
  const [entries, setEntries]     = useState<Entry[]>(ENTRIES);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newEntryId, setNewEntryId] = useState<number | null>(null);
  const [toasts, setToasts]       = useState<ToastItem[]>([]);
  const toastTimers               = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const searchRef                 = useRef<HTMLInputElement>(null);

  const trashCount = entries.filter(e => e.trashed).length;

  // Persist theme to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chronicle-theme', theme);
  }, [theme]);

  // Toast system
  const showToast = useCallback((text: string, action?: { label: string; cb: () => void }) => {
    const id = ++toastSeq;
    setToasts(prev => [...prev.slice(-2), { id, text, action }]);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimers.current.delete(id);
    }, 5000);
    toastTimers.current.set(id, timer);
  }, []);

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) { clearTimeout(timer); toastTimers.current.delete(id); }
  }

  // Entry CRUD
  function handleSave(entry: Entry) {
    setEntries(prev => [entry, ...prev]);
    setNewEntryId(entry.id);
    showToast('Entry saved');
    setTimeout(() => setNewEntryId(null), 3000);
  }

  function handleUpdate(updatedEntry: Entry) {
    setEntries(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
    setNewEntryId(updatedEntry.id);
    showToast('Entry updated');
    setTimeout(() => setNewEntryId(null), 3000);
  }

  function handleTrash(ids: Set<number>) {
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: true } : e));
  }

  function handleRestore(ids: Set<number>) {
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, trashed: false } : e));
  }

  function handleDelete(ids: Set<number>) {
    setEntries(prev => prev.filter(e => !ids.has(e.id)));
  }

  function handleImport(newEntries: Entry[]) {
    setEntries(prev => [...newEntries, ...prev]);
    showToast(`${newEntries.length} ${newEntries.length === 1 ? 'entry' : 'entries'} imported`);
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

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Escape: close any open overlay
      if (e.key === 'Escape') {
        if (showDrawer) { handleDrawerClose(); return; }
        if (showImport) { setShowImport(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
      }

      // Skip other shortcuts if typing in an input
      if (inInput) return;

      // ? : show shortcuts
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }

      // N : new entry (timesheet or dashboard only)
      if (e.key === 'n' || e.key === 'N') {
        if (view === 'timesheet' || view === 'dashboard') {
          e.preventDefault();
          setEditEntry(undefined);
          setShowDrawer(true);
        }
        return;
      }

      // / : focus search (timesheet only)
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
  }, [view, showDrawer, showImport, showShortcuts]);

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
        currentUser={MEMBERS[0]}
        onSignOut={() => { window.location.href = '/login'; }}
      />
      <div className="main-area">
        <TopBar title={title} sub={sub} actions={topBarActions} />

        {view === 'timesheet' ? (
          <Timesheet
            entries={entries}
            onTrash={handleTrash}
            onRestore={handleRestore}
            onEdit={handleEdit}
            showToast={showToast}
            newEntryId={newEntryId}
            searchRef={searchRef}
          />
        ) : view === 'dashboard' ? (
          <Dashboard entries={entries} />
        ) : view === 'export' ? (
          <ExportPage entries={entries} showToast={showToast} />
        ) : view === 'trash' ? (
          <TrashPage entries={entries} onRestore={handleRestore} onDelete={handleDelete} showToast={showToast} />
        ) : (view === 'clients' || view === 'team' || view === 'account') ? (
          <SettingsPage section={view} onNavigate={setView} showToast={showToast} />
        ) : null}
      </div>

      {/* New / Edit entry drawer */}
      {showDrawer && (
        <EntryDrawer
          entry={editEntry}
          onClose={handleDrawerClose}
          onSave={handleDrawerSave}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal
          existingEntries={entries}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Keyboard shortcuts dialog */}
      {showShortcuts && (
        <ShortcutsDialog onClose={() => setShowShortcuts(false)} />
      )}

      {/* Toast container */}
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
