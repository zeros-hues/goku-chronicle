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
}

export interface Client {
  id: string;
  name: string;
  type: 'client' | 'internal';
  projects: Project[];
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

export const CLIENTS: Client[] = [
  {
    id: 'appasamy',
    name: 'Appasamy',
    type: 'client',
    projects: [
      { id: 'autoref',   name: 'Autoref',       color: 'var(--c-autoref)',   billing: 'retainer' },
      { id: 'perimeter', name: 'Perimeter',     color: 'var(--c-perimeter)', billing: 'retainer' },
      { id: 'phaco',     name: 'Phaco',         color: 'var(--c-phaco)',     billing: 'retainer' },
      { id: 'dynalase',  name: 'Dynalase',      color: 'var(--c-dynalase)',  billing: 'retainer' },
      { id: '3dmicro',   name: '3D Microscope', color: 'var(--c-3dmicro)',   billing: 'retainer' },
      { id: 'oculume',   name: 'Oculume',       color: 'var(--c-oculume)',   billing: 'out' },
      { id: 'digimap',   name: 'Digimap',       color: 'var(--c-digimap)',   billing: 'out' },
    ],
  },
  {
    id: 'goku',
    name: 'Goku Studio',
    type: 'internal',
    projects: [
      { id: 'website', name: 'Website', color: 'var(--c-website)', billing: 'internal' },
    ],
  },
];

export const ALL_PROJECTS = CLIENTS.flatMap(c =>
  c.projects.map(p => ({ ...p, clientId: c.id, clientName: c.name }))
);

export const PROJECT_BY_ID = Object.fromEntries(ALL_PROJECTS.map(p => [p.id, p]));

export const MEMBERS: Member[] = [
  { id: 'g',   name: 'Gokul',        init: 'G',   avatarClass: 'av-0', color: 'var(--c-autoref)',   active: true,  wa: '+91 98XXX 21234' },
  { id: 'pd',  name: 'Pradeep',      init: 'Pd',  avatarClass: 'av-1', color: 'var(--c-perimeter)', active: true,  wa: '+91 98XXX 45872' },
  { id: 'dk',  name: 'Dinesh Kumar', init: 'DK',  avatarClass: 'av-2', color: 'var(--c-dynalase)',  active: true,  wa: '+91 98XXX 33216' },
  { id: 'ma',  name: 'Mustaq Ahmed', init: 'MA',  avatarClass: 'av-3', color: 'var(--c-3dmicro)',   active: true,  wa: '+91 98XXX 19087' },
  { id: 'sid', name: 'Siddharth',    init: 'Sid', avatarClass: 'av-4', color: 'var(--c-phaco)',     active: true,  wa: '+91 98XXX 76654' },
  { id: 'pr',  name: 'Prakash',      init: 'Pr',  avatarClass: 'av-5', color: 'var(--c-website)',   active: false, wa: '' },
];

export const TODAY = new Date(2026, 4, 22); // May 22, 2026

export const HOLIDAYS: Record<string, string> = {
  '2026-01-26': 'Republic Day',
  '2026-03-25': 'Holi',
  '2026-04-14': 'Tamil New Year',
  '2026-05-01': 'May Day',
};

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

export const ENTRIES: Entry[] = [
  {
    id: 1,
    date: '2026-05-22',
    projectId: 'autoref',
    type: 'task',
    task: 'UI Refinements — Settings panel redesign with new color tokens',
    billing: 'retainer',
    hours: { g: 3, pd: 2 },
    createdAt: 1,
  },
  {
    id: 2,
    date: '2026-05-22',
    projectId: 'perimeter',
    type: 'meeting',
    task: 'Sprint review & backlog grooming',
    billing: 'retainer',
    hours: {},
    meetingDuration: 1.5,
    meetingPeople: 4,
    createdAt: 2,
  },
  {
    id: 3,
    date: '2026-05-22',
    projectId: 'phaco',
    type: 'task',
    task: 'Device calibration flow — haptic feedback implementation',
    billing: 'retainer',
    hours: { dk: 4, ma: 2 },
    createdAt: 3,
  },
  {
    id: 4,
    date: '2026-05-21',
    projectId: 'dynalase',
    type: 'task',
    task: 'Laser protocol export — PDF generation & signing',
    billing: 'retainer',
    hours: { g: 2, sid: 3 },
    createdAt: 4,
  },
  {
    id: 5,
    date: '2026-05-21',
    projectId: 'oculume',
    type: 'task',
    task: 'Onboarding screens — illustration pass',
    billing: 'out',
    hours: { pd: 5 },
    createdAt: 5,
  },
  {
    id: 6,
    date: '2026-05-21',
    projectId: 'website',
    type: 'task',
    task: 'Portfolio case study — Autoref write-up',
    billing: 'internal',
    hours: { g: 1 },
    createdAt: 6,
  },
  // Earlier week
  {
    id: 7,
    date: '2026-05-20',
    projectId: 'autoref',
    type: 'task',
    task: 'Control module state machine refactor',
    billing: 'retainer',
    hours: { g: 4, pd: 3 },
    createdAt: 7,
  },
  {
    id: 8,
    date: '2026-05-20',
    projectId: 'phaco',
    type: 'task',
    task: 'Ultrasound waveform visualisation',
    billing: 'retainer',
    hours: { dk: 5, ma: 3 },
    createdAt: 8,
  },
  {
    id: 9,
    date: '2026-05-19',
    projectId: 'perimeter',
    type: 'meeting',
    task: 'Client alignment — Q2 roadmap',
    billing: 'retainer',
    hours: {},
    meetingDuration: 1,
    meetingPeople: 5,
    createdAt: 9,
  },
  {
    id: 10,
    date: '2026-05-19',
    projectId: 'dynalase',
    type: 'task',
    task: 'Treatment log export — CSV + print views',
    billing: 'retainer',
    hours: { sid: 4, g: 2 },
    createdAt: 10,
  },
  {
    id: 11,
    date: '2026-05-19',
    projectId: 'oculume',
    type: 'task',
    task: 'Icon set — 48 custom glyphs final pass',
    billing: 'out',
    hours: { pd: 6 },
    createdAt: 11,
  },
  {
    id: 12,
    date: '2026-05-16',
    projectId: 'autoref',
    type: 'task',
    task: 'Measurement result screen — A/B variants',
    billing: 'retainer',
    hours: { g: 3, pd: 2 },
    createdAt: 12,
  },
  {
    id: 13,
    date: '2026-05-16',
    projectId: '3dmicro',
    type: 'task',
    task: 'Depth visualisation — 3D render pipeline',
    billing: 'retainer',
    hours: { ma: 5, dk: 3 },
    createdAt: 13,
  },
  {
    id: 14,
    date: '2026-05-15',
    projectId: 'digimap',
    type: 'task',
    task: 'Map layer controls — multi-select interaction',
    billing: 'out',
    hours: { sid: 5, pd: 2 },
    createdAt: 14,
  },
  {
    id: 15,
    date: '2026-05-15',
    projectId: 'phaco',
    type: 'task',
    task: 'Handpiece calibration sequence — new flow',
    billing: 'retainer',
    hours: { dk: 4, ma: 2 },
    createdAt: 15,
  },
  {
    id: 16,
    date: '2026-05-14',
    projectId: 'perimeter',
    type: 'task',
    task: 'Patient report PDF — typography pass',
    billing: 'retainer',
    hours: { g: 3, pd: 3 },
    createdAt: 16,
  },
  {
    id: 17,
    date: '2026-05-13',
    projectId: 'website',
    type: 'task',
    task: 'Studio homepage — hero section redesign',
    billing: 'internal',
    hours: { g: 2, sid: 1 },
    createdAt: 17,
  },
  // Trashed entries
  {
    id: 18,
    date: '2026-05-20',
    projectId: 'digimap',
    type: 'task',
    task: 'Satellite layer toggle — duplicated effort, superseded by entry #14',
    billing: 'out',
    hours: { sid: 2 },
    createdAt: 18,
    trashed: true,
  },
  {
    id: 19,
    date: '2026-05-18',
    projectId: 'autoref',
    type: 'meeting',
    task: 'Internal sync — cancelled, logged in error',
    billing: 'retainer',
    hours: {},
    meetingDuration: 0.5,
    meetingPeople: 3,
    createdAt: 19,
    trashed: true,
  },
  {
    id: 20,
    date: '2026-05-15',
    projectId: 'phaco',
    type: 'task',
    task: 'Test entry — please ignore',
    billing: 'retainer',
    hours: { dk: 1 },
    createdAt: 20,
    trashed: true,
  },
];
