export type View =
  | 'timesheet'
  | 'dashboard'
  | 'export'
  | 'trash'
  | 'clients'
  | 'team'
  | 'account';

export type Theme = 'light' | 'dark';

export type BillingType = 'retainer' | 'out' | 'internal';

export interface Project {
  id: string;
  name: string;
  color: string;
  billing: BillingType;
  archivedAt?: string | null;
}

export interface Client {
  id: string;
  name: string;
  type: 'client' | 'internal';
  projects: Project[];
  hasRetainership?: boolean;
}

export interface Member {
  id: string;
  name: string;
  init: string;
  avatarClass: string;
  color: string;
  active: boolean;
  wa: string;
}

export interface Entry {
  id: number;
  date: string;
  projectId: string;
  type: 'task' | 'meeting';
  task: string;
  billing: BillingType;
  hours: Record<string, number>;
  meetingDuration?: number;
  meetingPeople?: number;
  createdAt: number;
  trashed?: boolean;
}

/* ── Deterministic color palette ────────────────────────────────── */

const COLOR_PALETTE = [
  'oklch(0.68 0.13 160)',
  'oklch(0.65 0.14 250)',
  'oklch(0.66 0.14 30)',
  'oklch(0.65 0.13 290)',
  'oklch(0.70 0.13 80)',
  'oklch(0.65 0.12 200)',
  'oklch(0.64 0.13 330)',
  'oklch(0.66 0.14 0)',
  'oklch(0.67 0.13 130)',
  'oklch(0.65 0.13 220)',
  'oklch(0.66 0.12 60)',
  'oklch(0.65 0.13 310)',
];

export function getColorFromSeed(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash = hash & 0x7fffffff;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

/* ── Utility functions ──────────────────────────────────────────── */

export function pad(n: number) { return String(n).padStart(2, '0'); }
export function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function dowShort(d: Date) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]; }
export function dowFull(d: Date)  { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]; }
export function monShort(d: Date) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]; }
export function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6; }

export function entryHours(e: Entry) {
  if (e.type === 'meeting') return (e.meetingDuration ?? 0) * (e.meetingPeople ?? 0);
  return Object.values(e.hours).reduce((a, b) => a + b, 0);
}

export function entryMemberHours(e: Entry, memId: string): number {
  if (e.type === 'meeting') return 0;
  return e.hours[memId] ?? 0;
}
