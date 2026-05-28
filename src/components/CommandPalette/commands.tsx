import React from 'react';
import type { View, Client, Member, Theme } from '@/lib/data';
import type { DatePreset, BillingFilter } from '@/context/FilterContext';
import {
  IconTimesheet, IconDashboard, IconExport, IconTrash,
  IconClients, IconTeam, IconAccount,
  IconPlus, IconImport, IconCalendar, IconFilter,
  IconMoon, IconSun, IconSearch,
} from '@/components/Icons';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  shortcut?: string;
  action: () => void;
}

export interface PaletteGroup {
  id: string;
  heading: string;
  commands: PaletteCommand[];
}

export interface BuildCommandsCtx {
  view: View;
  clients: Client[];
  members: Member[];
  navigate: (v: View) => void;
  setPreset: (p: DatePreset) => void;
  setClient: (id: string | null) => void;
  setBillingType: (b: BillingFilter) => void;
  onNewEntry: () => void;
  onImport: () => void;
  onToggleSidebar: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onShowShortcuts: () => void;
  onResetFilters: () => void;
}

const calIcon = <IconCalendar size={14} />;
const filterIcon = <IconFilter size={14} />;

export function buildCommands(ctx: BuildCommandsCtx): PaletteGroup[] {
  const {
    view, clients, navigate,
    setPreset, setClient, setBillingType,
    onNewEntry, onImport, onToggleSidebar,
    theme, onSetTheme, onShowShortcuts, onResetFilters,
  } = ctx;

  const groups: PaletteGroup[] = [];

  /* ── Navigation ────────────────────────────────────────── */
  const navCommands: PaletteCommand[] = [
    view !== 'timesheet' && {
      id: 'nav-timesheet', label: 'Go to Timesheet',
      icon: <IconTimesheet size={14} />, keywords: 'timesheet log hours entries',
      shortcut: '1', action: () => navigate('timesheet'),
    },
    view !== 'dashboard' && {
      id: 'nav-dashboard', label: 'Go to Dashboard',
      icon: <IconDashboard size={14} />, keywords: 'dashboard analytics overview stats',
      shortcut: '2', action: () => navigate('dashboard'),
    },
    view !== 'export' && {
      id: 'nav-export', label: 'Go to Export',
      icon: <IconExport size={14} />, keywords: 'export csv download print report',
      shortcut: '3', action: () => navigate('export'),
    },
    view !== 'trash' && {
      id: 'nav-trash', label: 'Go to Trash',
      icon: <IconTrash size={14} />, keywords: 'trash deleted restore recycle bin',
      action: () => navigate('trash'),
    },
  ].filter(Boolean) as PaletteCommand[];

  if (navCommands.length > 0) {
    groups.push({ id: 'navigation', heading: 'Navigation', commands: navCommands });
  }

  /* ── Actions ───────────────────────────────────────────── */
  const actionCommands: PaletteCommand[] = [];

  if (view === 'timesheet' || view === 'dashboard') {
    actionCommands.push({
      id: 'action-new-entry', label: 'New Entry',
      hint: 'Open entry drawer', icon: <IconPlus size={14} />,
      keywords: 'new create add entry task meeting hours',
      shortcut: 'N', action: onNewEntry,
    });
  }

  if (view === 'timesheet') {
    actionCommands.push({
      id: 'action-import', label: 'Import CSV',
      icon: <IconImport size={14} />, keywords: 'import upload csv file bulk',
      action: onImport,
    });
  }

  actionCommands.push(
    {
      id: 'action-toggle-sidebar', label: 'Toggle Sidebar',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="4" height="12" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="8" y="2" width="6" height="12" rx="1" fill="currentColor" />
        </svg>
      ),
      keywords: 'sidebar collapse expand toggle panel',
      shortcut: '[', action: onToggleSidebar,
    },
    {
      id: 'action-toggle-theme',
      label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: theme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />,
      keywords: 'theme dark light mode appearance color scheme',
      action: () => onSetTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'action-shortcuts', label: 'Keyboard Shortcuts',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="4" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="4" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
          <rect x="7" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
          <rect x="10" y="7" width="2" height="2" rx="0.5" fill="currentColor" />
        </svg>
      ),
      keywords: 'shortcuts keyboard help hotkeys bindings',
      shortcut: '?', action: onShowShortcuts,
    },
    {
      id: 'action-reset-filters', label: 'Reset All Filters',
      icon: filterIcon,
      keywords: 'reset clear filters default all',
      action: onResetFilters,
    },
  );

  groups.push({ id: 'actions', heading: 'Actions', commands: actionCommands });

  /* ── Settings ──────────────────────────────────────────── */
  groups.push({
    id: 'settings', heading: 'Settings',
    commands: [
      {
        id: 'settings-clients', label: 'Clients & Projects',
        icon: <IconClients size={14} />,
        keywords: 'settings clients projects manage billing',
        action: () => navigate('clients'),
      },
      {
        id: 'settings-team', label: 'Team Members',
        icon: <IconTeam size={14} />,
        keywords: 'settings team members staff people',
        action: () => navigate('team'),
      },
      {
        id: 'settings-account', label: 'Account & Preferences',
        icon: <IconAccount size={14} />,
        keywords: 'settings account preferences hours target holidays',
        action: () => navigate('account'),
      },
    ],
  });

  /* ── Date filters ──────────────────────────────────────── */
  groups.push({
    id: 'date', heading: 'Date Range',
    commands: [
      { id: 'date-today',      label: 'Today',        icon: calIcon, keywords: 'date filter today',     action: () => setPreset('today') },
      { id: 'date-this-week',  label: 'This Week',    icon: calIcon, keywords: 'date filter this week', action: () => setPreset('this_week') },
      { id: 'date-last-week',  label: 'Last Week',    icon: calIcon, keywords: 'date filter last week', action: () => setPreset('last_week') },
      { id: 'date-this-month', label: 'This Month',   icon: calIcon, keywords: 'date filter this month current', action: () => setPreset('this_month') },
      { id: 'date-last-month', label: 'Last Month',   icon: calIcon, keywords: 'date filter last month previous', action: () => setPreset('last_month') },
      { id: 'date-30',         label: 'Last 30 Days', icon: calIcon, keywords: 'date filter 30 days rolling', action: () => setPreset('last_30') },
      { id: 'date-60',         label: 'Last 60 Days', icon: calIcon, keywords: 'date filter 60 days rolling', action: () => setPreset('last_60') },
      { id: 'date-this-year',  label: 'This Year',    icon: calIcon, keywords: 'date filter year annual ytd', action: () => setPreset('this_year') },
      { id: 'date-all',        label: 'All Entries',  icon: calIcon, keywords: 'date filter all time everything', action: () => setPreset('all') },
    ],
  });

  /* ── Client filters ────────────────────────────────────── */
  const clientCmds: PaletteCommand[] = [
    {
      id: 'client-all', label: 'All Clients',
      icon: <IconSearch size={14} />,
      keywords: 'client filter all clear reset',
      action: () => setClient(null),
    },
    ...clients.map(c => ({
      id: `client-${c.id}`,
      label: `Filter by ${c.name}`,
      hint: c.type === 'internal' ? 'Internal' : undefined,
      icon: (
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--ink-ghost)', display: 'inline-block', flexShrink: 0,
        }} />
      ),
      keywords: `client filter project ${c.name.toLowerCase()}`,
      action: () => setClient(c.id),
    })),
  ];

  groups.push({ id: 'clients', heading: 'Filter by Client', commands: clientCmds });

  /* ── Billing filters ───────────────────────────────────── */
  groups.push({
    id: 'billing', heading: 'Filter by Billing',
    commands: [
      { id: 'bill-all',      label: 'All Billing Types', icon: filterIcon, keywords: 'billing all filter clear', action: () => setBillingType('all') },
      { id: 'bill-retainer', label: 'Retainer Only',     icon: filterIcon, keywords: 'billing retainer retainership', action: () => setBillingType('retainer') },
      { id: 'bill-out',      label: 'Out-of-scope Only', icon: filterIcon, keywords: 'billing out of scope oos extra', action: () => setBillingType('out') },
      { id: 'bill-internal', label: 'Internal Only',     icon: filterIcon, keywords: 'billing internal studio overhead', action: () => setBillingType('internal') },
    ],
  });

  return groups;
}
