import type { ReactNode } from 'react';
import type { DatePreset, BillingFilter } from '@/context/FilterContext';
import type { View, Theme } from '@/lib/data';

export interface PaletteRawMember {
  id: string;
  name: string;
  init: string;
  color: string;
  active: boolean;
}

export interface PaletteRawProject {
  id: string;
  name: string;
  color: string;
  billing: string;
  archivedAt?: string | null;
  clientId: string;
  clientName: string;
}

export interface PaletteRawClient {
  id: string;
  name: string;
  type: 'client' | 'internal';
  hasRetainership?: boolean;
  projects: PaletteRawProject[];
}

export interface PaletteData {
  members: PaletteRawMember[];
  projects: PaletteRawProject[];
  clients: PaletteRawClient[];
}

export interface AliasMaps {
  memberAliases: Map<string, PaletteRawMember>;
  projectAliases: Map<string, PaletteRawProject>;
}

export interface ParsedIntent {
  members: PaletteRawMember[];
  excludedMembers: PaletteRawMember[];
  project: PaletteRawProject | null;
  client: PaletteRawClient | null;
  datePreset: DatePreset | null;
  customDate: { start: string; end: string } | null;
  billingType: BillingFilter | null;
  entryType: 'task' | 'meeting' | null;
  hoursFilter: { gt?: number; lt?: number; eq?: number } | null;
  wantsGaps: boolean;
  action: 'filter' | 'export' | 'navigate' | 'log' | 'stats' | 'activity' | 'compare' | 'easter_egg' | null;
  exportFormat: 'excel' | 'json' | null;
  quickLog: { hours?: number; projectId?: string } | null;
  wantsActivity: boolean;
  wantsStats: boolean;
  wantsCompare: boolean;
  confidence: number;
  detectedTokens: string[];
  easterEgg?: string;
}

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  category: string;
  keywords?: string[];
  shortcut?: string;
  badge?: string;
  disabled?: boolean;
  action: () => void;
}

export interface PaletteGroup {
  id: string;
  heading: string;
  commands: PaletteCommand[];
}

export interface HistoryItem {
  query: string;
  label: string;
  timestamp: number;
}

export interface CommandContext {
  view: View;
  theme: Theme;
  data: PaletteData | null;
  navigate: (v: View) => void;
  setPreset: (p: DatePreset) => void;
  setClient: (id: string | null) => void;
  setBillingType: (b: BillingFilter) => void;
  resetFilters: () => void;
  onNewEntry: () => void;
  onImport: () => void;
  onToggleSidebar: () => void;
  onSetTheme: (t: Theme) => void;
  onShowShortcuts: () => void;
  onOpenActivity: () => void;
}
