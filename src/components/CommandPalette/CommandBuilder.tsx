import React from 'react';
import type { PaletteCommand, PaletteGroup, CommandContext } from './types';
import type { DatePreset } from '@/context/FilterContext';
import {
  IconTimesheet, IconDashboard, IconExport, IconTrash,
  IconClients, IconTeam, IconAccount,
  IconPlus, IconImport, IconCalendar, IconFilter,
  IconMoon, IconSun,
} from '@/components/Icons';

/* ── Inline icon helpers ────────────────────────────────────── */

function SidebarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="4" height="12" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="8" y="2" width="6" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function KbdIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="7" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="10" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="3" cy="8" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="13" cy="8" r="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function DotIcon({ color, faded }: { color: string; faded?: boolean }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: color, display: 'inline-block', flexShrink: 0,
      opacity: faded ? 0.4 : 1,
    }} />
  );
}

function AvatarIcon({ init, color }: { init: string; color: string }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%',
      background: color, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 9, color: '#fff',
      fontFamily: 'var(--font-mono)', fontWeight: 700, flexShrink: 0,
    }}>
      {init}
    </span>
  );
}

const calIcon = <IconCalendar size={14} />;
const filterIcon = <IconFilter size={14} />;

const DATE_PRESETS: { id: DatePreset; label: string; kw: string[] }[] = [
  { id: 'today',      label: 'Today',        kw: ['today', 'date'] },
  { id: 'this_week',  label: 'This Week',    kw: ['this week', 'week', 'date'] },
  { id: 'last_week',  label: 'Last Week',    kw: ['last week', 'week', 'date'] },
  { id: 'this_month', label: 'This Month',   kw: ['this month', 'month', 'current', 'date'] },
  { id: 'last_month', label: 'Last Month',   kw: ['last month', 'previous', 'date'] },
  { id: 'last_30',    label: 'Last 30 Days', kw: ['30 days', 'rolling', 'date'] },
  { id: 'last_60',    label: 'Last 60 Days', kw: ['60 days', 'rolling', 'date'] },
  { id: 'this_year',  label: 'This Year',    kw: ['this year', 'annual', 'ytd', 'date'] },
  { id: 'all',        label: 'All Entries',  kw: ['all', 'all time', 'everything', 'date'] },
];

/* ── Builder ────────────────────────────────────────────────── */

export function buildCommands(ctx: CommandContext): PaletteGroup[] {
  const {
    view, theme, data, navigate,
    setPreset, setClient, setBillingType, resetFilters,
    onNewEntry, onImport, onToggleSidebar,
    onSetTheme, onShowShortcuts, onOpenActivity,
  } = ctx;

  const groups: PaletteGroup[] = [];

  /* ── Navigation ──────────────────────────────────────────── */
  const navCmds: PaletteCommand[] = (
    [
      view !== 'timesheet' && { id: 'nav-timesheet', label: 'Go to Timesheet', icon: <IconTimesheet size={14} />, keywords: ['timesheet', 'log', 'hours', 'entries', 'table'], shortcut: '1', action: () => navigate('timesheet') },
      view !== 'dashboard' && { id: 'nav-dashboard', label: 'Go to Dashboard',  icon: <IconDashboard size={14} />, keywords: ['dashboard', 'stats', 'charts', 'overview', 'analytics'], shortcut: '2', action: () => navigate('dashboard') },
      view !== 'export'    && { id: 'nav-export',    label: 'Go to Export',      icon: <IconExport size={14} />,   keywords: ['export', 'download', 'report', 'excel', 'csv'], shortcut: '3', action: () => navigate('export') },
      view !== 'trash'     && { id: 'nav-trash',     label: 'Go to Trash',       icon: <IconTrash size={14} />,    keywords: ['trash', 'deleted', 'restore', 'recycle'], action: () => navigate('trash') },
    ] as (PaletteCommand | false)[]
  ).filter(Boolean) as PaletteCommand[];

  if (navCmds.length) groups.push({ id: 'navigation', heading: 'Navigation', commands: navCmds });

  /* ── Actions ─────────────────────────────────────────────── */
  const actionCmds: PaletteCommand[] = [];

  if (view === 'timesheet' || view === 'dashboard') {
    actionCmds.push({
      id: 'action-new-entry', label: 'New Entry', hint: 'Open entry drawer',
      icon: <IconPlus size={14} />,
      category: 'action', keywords: ['new', 'create', 'add', 'entry', 'task', 'log'],
      shortcut: 'N', action: onNewEntry,
    });
  }
  if (view === 'timesheet') {
    actionCmds.push({
      id: 'action-import', label: 'Import Entries',
      icon: <IconImport size={14} />,
      category: 'action', keywords: ['import', 'upload', 'csv', 'excel', 'bulk'],
      action: onImport,
    });
  }
  actionCmds.push(
    { id: 'action-activity',       label: 'Activity Log',        icon: <ActivityIcon />,  category: 'action', keywords: ['activity', 'log', 'history', 'who', 'changed'], action: onOpenActivity },
    { id: 'action-toggle-sidebar', label: 'Toggle Sidebar',      icon: <SidebarIcon />,   category: 'action', keywords: ['sidebar', 'collapse', 'expand', 'toggle'],      shortcut: '[', action: onToggleSidebar },
    {
      id: 'action-toggle-theme',
      label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />,
      category: 'action', keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
      action: () => onSetTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    { id: 'action-shortcuts',      label: 'Keyboard Shortcuts',  icon: <KbdIcon />,       category: 'action', keywords: ['shortcuts', 'keyboard', 'help', 'hotkeys'], shortcut: '?', action: onShowShortcuts },
    { id: 'action-reset-filters',  label: 'Clear All Filters',   icon: filterIcon,         category: 'action', keywords: ['reset', 'clear', 'filters', 'default'],       action: resetFilters },
  );

  groups.push({ id: 'actions', heading: 'Actions', commands: actionCmds });

  /* ── Settings ────────────────────────────────────────────── */
  groups.push({
    id: 'settings', heading: 'Settings',
    commands: [
      { id: 'settings-clients', label: 'Clients & Projects',    icon: <IconClients size={14} />, category: 'navigate', keywords: ['settings', 'clients', 'projects', 'billing'], action: () => navigate('clients') },
      { id: 'settings-team',    label: 'Team Members',          icon: <IconTeam size={14} />,    category: 'navigate', keywords: ['settings', 'team', 'members', 'staff'],        action: () => navigate('team') },
      { id: 'settings-account', label: 'Account & Preferences', icon: <IconAccount size={14} />, category: 'navigate', keywords: ['settings', 'account', 'preferences', 'password', 'holidays'], action: () => navigate('account') },
    ],
  });

  /* ── Date Range ──────────────────────────────────────────── */
  groups.push({
    id: 'date', heading: 'Date Range',
    commands: DATE_PRESETS.map(p => ({
      id: `date-${p.id}`, label: p.label,
      icon: calIcon, category: 'filter', keywords: p.kw,
      action: () => setPreset(p.id),
    })),
  });

  /* ── Dynamic groups (require data) ──────────────────────── */

  if (data) {
    /* Clients */
    groups.push({
      id: 'clients', heading: 'Filter by Client',
      commands: [
        {
          id: 'client-all', label: 'All Clients', icon: filterIcon, category: 'filter',
          keywords: ['client', 'all', 'clear', 'reset'],
          action: () => setClient(null),
        },
        ...data.clients.map(c => ({
          id: `client-${c.id}`,
          label: `Filter by ${c.name}`,
          hint: c.type === 'internal' ? 'Internal' : undefined,
          icon: <DotIcon color="var(--ink-ghost)" />,
          category: 'filter',
          keywords: ['client', 'filter', c.name.toLowerCase(), ...c.name.toLowerCase().split(' ')],
          action: () => setClient(c.id),
        })),
      ],
    });

    /* Projects */
    const activeProjects  = data.projects.filter(p => !p.archivedAt);
    const archivedProjects = data.projects.filter(p => p.archivedAt);

    if (data.projects.length > 0) {
      groups.push({
        id: 'projects', heading: 'Filter by Project',
        commands: [
          ...activeProjects.map(p => ({
            id: `project-${p.id}`,
            label: `Filter by ${p.name}`,
            hint: p.clientName,
            icon: <DotIcon color={p.color} />,
            category: 'filter',
            keywords: ['project', 'filter', p.name.toLowerCase(), p.clientName.toLowerCase(), ...p.name.toLowerCase().split(' ')],
            action: () => setClient(p.clientId),
          })),
          ...archivedProjects.map(p => ({
            id: `project-arc-${p.id}`,
            label: `Filter by ${p.name}`,
            hint: p.clientName,
            badge: 'Archived',
            icon: <DotIcon color={p.color} faded />,
            category: 'filter',
            keywords: ['project', 'filter', 'archived', p.name.toLowerCase(), p.clientName.toLowerCase()],
            action: () => setClient(p.clientId),
          })),
        ],
      });
    }

    /* Members */
    if (data.members.length > 0) {
      groups.push({
        id: 'members', heading: 'Filter by Member',
        commands: data.members.map(m => ({
          id: `member-${m.id}`,
          label: `Show ${m.name}'s entries`,
          badge: !m.active ? 'Inactive' : undefined,
          icon: <AvatarIcon init={m.init} color={m.color} />,
          category: 'filter',
          keywords: ['member', 'filter', m.name.toLowerCase(), m.init.toLowerCase(), m.name.split(' ')[0].toLowerCase()],
          action: () => navigate('timesheet'),
        })),
      });
    }
  }

  /* ── Billing ─────────────────────────────────────────────── */
  groups.push({
    id: 'billing', heading: 'Filter by Billing',
    commands: [
      { id: 'bill-all',      label: 'All Billing Types',   icon: filterIcon, category: 'filter', keywords: ['billing', 'all', 'clear'],                         action: () => setBillingType('all') },
      { id: 'bill-retainer', label: 'Retainership Work',   icon: filterIcon, category: 'filter', keywords: ['billing', 'retainer', 'retainership', 'billable'],  action: () => setBillingType('retainer') },
      { id: 'bill-out',      label: 'Out-of-scope Work',   icon: filterIcon, category: 'filter', keywords: ['billing', 'out', 'scope', 'oos', 'non retainer'],   action: () => setBillingType('out') },
      { id: 'bill-internal', label: 'Internal Work',       icon: filterIcon, category: 'filter', keywords: ['billing', 'internal', 'overhead'],                  action: () => setBillingType('internal') },
    ],
  });

  return groups;
}
