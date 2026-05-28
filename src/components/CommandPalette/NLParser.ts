import { fmtDate } from '@/lib/data';
import type { DatePreset, BillingFilter } from '@/context/FilterContext';
import type {
  PaletteData, PaletteRawMember, PaletteRawProject, PaletteRawClient,
  ParsedIntent, AliasMaps,
} from './types';
import { fuzzyFindMember, fuzzyFindProject } from './PaletteData';

/* ── Date label helpers ─────────────────────────────────────── */

const PRESET_LABELS: Record<string, string> = {
  today: 'today', this_week: 'this week', last_week: 'last week',
  this_month: 'this month', last_month: 'last month',
  this_year: 'this year', all: 'all time',
};
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function formatDateLabel(preset: string): string {
  return PRESET_LABELS[preset] ?? preset.replace(/_/g, ' ');
}

/* ── Easter-egg guard ───────────────────────────────────────── */

const EASTER_EGGS: [RegExp, string][] = [
  [/^god mode$/i,             'god_mode'],
  [/who built this|credits|made by/i, 'credits'],
  [/^konami$/i,               'konami'],
];

/* ── Main parser ────────────────────────────────────────────── */

export function parseNaturalQuery(
  query: string,
  data: PaletteData,
  aliases: AliasMaps,
): ParsedIntent {
  const lower  = query.toLowerCase().trim();
  const words  = lower.split(/\s+/);
  let confidence = 0;
  const detectedTokens: string[] = [];

  // Easter eggs
  for (const [pattern, key] of EASTER_EGGS) {
    if (pattern.test(lower)) {
      return mkEaster(key);
    }
  }

  /* ── Members ─────────────────────────────────────────────── */

  const members: PaletteRawMember[]         = [];
  const excludedMembers: PaletteRawMember[] = [];

  const excl = lower.match(/(?:except|not|without|excluding)\s+(\w+)/i);
  if (excl) {
    const m = fuzzyFindMember(excl[1], data.members, aliases.memberAliases);
    if (m) excludedMembers.push(m);
  }

  const andM = lower.match(/(\w+)\s+and\s+(\w+)/);
  if (andM) {
    const m1 = fuzzyFindMember(andM[1], data.members, aliases.memberAliases);
    const m2 = fuzzyFindMember(andM[2], data.members, aliases.memberAliases);
    if (m1) members.push(m1);
    if (m2 && m2.id !== m1?.id) members.push(m2);
  }

  for (const word of words) {
    const m = fuzzyFindMember(word, data.members, aliases.memberAliases);
    if (m && !members.find(x => x.id === m.id) && !excludedMembers.find(x => x.id === m.id)) {
      members.push(m);
      confidence += 0.35;
      detectedTokens.push(m.name);
    }
  }

  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    const m = fuzzyFindMember(pair, data.members, aliases.memberAliases);
    if (m && !members.find(x => x.id === m.id)) {
      members.push(m);
      confidence += 0.35;
      if (!detectedTokens.includes(m.name)) detectedTokens.push(m.name);
    }
  }

  /* ── Project ─────────────────────────────────────────────── */

  let project: PaletteRawProject | null = null;

  for (let i = 0; i < words.length - 1 && !project; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    const p = fuzzyFindProject(pair, data.projects, aliases.projectAliases);
    if (p) { project = p; confidence += 0.35; detectedTokens.push(p.name); }
  }

  if (!project) {
    for (const word of words) {
      const p = fuzzyFindProject(word, data.projects, aliases.projectAliases);
      if (p) { project = p; confidence += 0.35; detectedTokens.push(p.name); break; }
    }
  }

  /* ── Client ──────────────────────────────────────────────── */

  let client: PaletteRawClient | null = null;
  if (!project) {
    for (const c of data.clients) {
      if (lower.includes(c.name.toLowerCase())) {
        client = c; confidence += 0.2; detectedTokens.push(c.name); break;
      }
    }
  }

  /* ── Date ────────────────────────────────────────────────── */

  let datePreset: DatePreset | null = null;
  let customDate: { start: string; end: string } | null = null;

  const PRESET_MAP: [RegExp, DatePreset][] = [
    [/\btoday\b/,                               'today'],
    [/\bthis week\b|\btw\b/,                    'this_week'],
    [/\blast week\b|\blw\b/,                    'last_week'],
    [/\bthis month\b|\btm\b/,                   'this_month'],
    [/\blast month\b|\blm\b/,                   'last_month'],
    [/\bthis year\b/,                           'this_year'],
    [/\ball time\b|\beverything\b|\ball\b/,      'all'],
  ];

  for (const [rx, preset] of PRESET_MAP) {
    if (rx.test(lower)) {
      datePreset = preset;
      confidence += 0.2;
      detectedTokens.push(formatDateLabel(preset));
      break;
    }
  }

  // Month name → custom range for that month in current year
  if (!datePreset) {
    const MONTH_RX: [RegExp, number][] = [
      [/\bjanuary\b|\bjan\b/, 0], [/\bfebruary\b|\bfeb\b/, 1],
      [/\bmarch\b|\bmar\b/, 2],   [/\bapril\b|\bapr\b/, 3],
      [/\bmay\b/, 4],             [/\bjune\b|\bjun\b/, 5],
      [/\bjuly\b|\bjul\b/, 6],    [/\baugust\b|\baug\b/, 7],
      [/\bseptember\b|\bsep\b/, 8],[/\boctober\b|\boct\b/, 9],
      [/\bnovember\b|\bnov\b/, 10],[/\bdecember\b|\bdec\b/, 11],
    ];
    const now = new Date();
    for (const [rx, idx] of MONTH_RX) {
      if (rx.test(lower)) {
        const yr = now.getFullYear();
        customDate = {
          start: fmtDate(new Date(yr, idx, 1)),
          end:   fmtDate(new Date(yr, idx + 1, 0)),
        };
        datePreset = 'custom';
        confidence += 0.2;
        detectedTokens.push(MONTH_NAMES[idx]);
        break;
      }
    }
  }

  /* ── Billing ─────────────────────────────────────────────── */

  let billingType: BillingFilter | null = null;

  if (/\bretainer(ship)?\b/.test(lower) && !/non.retainer|out.of/.test(lower)) {
    billingType = 'retainer'; confidence += 0.15; detectedTokens.push('Retainer');
  } else if (/\bout.of.retainer|non.retainer|non retainer|out of scope|oos\b/.test(lower)) {
    billingType = 'out'; confidence += 0.15; detectedTokens.push('Out of retainer');
  } else if (/\binternal\b/.test(lower)) {
    billingType = 'internal'; confidence += 0.15; detectedTokens.push('Internal');
  } else if (/\bbillable\b/.test(lower)) {
    billingType = 'retainer'; confidence += 0.1;
  }

  /* ── Entry type ──────────────────────────────────────────── */

  let entryType: 'task' | 'meeting' | null = null;

  if (/\bmeeting(s)?\b/.test(lower) && !/no meeting|except meeting/.test(lower)) {
    entryType = 'meeting'; confidence += 0.15; detectedTokens.push('Meetings');
  } else if (/\btask(s)?\b/.test(lower)) {
    entryType = 'task'; confidence += 0.1;
  }

  /* ── Hours filter ────────────────────────────────────────── */

  let hoursFilter: ParsedIntent['hoursFilter'] = null;

  const gtM = lower.match(/over\s+(\d+\.?\d*)\s*h/);
  const ltM = lower.match(/under\s+(\d+\.?\d*)\s*h/);
  const eqM = lower.match(/exactly\s+(\d+\.?\d*)\s*h/);

  if (gtM) { hoursFilter = { gt: parseFloat(gtM[1]) }; confidence += 0.2; }
  else if (ltM) { hoursFilter = { lt: parseFloat(ltM[1]) }; confidence += 0.2; }
  else if (eqM) { hoursFilter = { eq: parseFloat(eqM[1]) }; confidence += 0.2; }

  const wantsGaps = /gap|no log|missing|no entries|didn.t log|not logged/.test(lower);

  /* ── Action ──────────────────────────────────────────────── */

  let action: ParsedIntent['action'] = null;
  let exportFormat: 'excel' | 'json' | null = null;

  const wantsExport  = /\bexport\b|\bdownload\b|\breport\b|\bsend\b/.test(lower);
  const wantsExcel   = /\bexcel\b|\bxlsx\b/.test(lower);
  const wantsJson    = /\bjson\b|\bbackup\b/.test(lower);
  const wantsActivity = /\bactivity\b|\bwho added\b|\bwho deleted\b|\bwho changed\b|\brecent import\b|\bwhat changed\b|\bwho logged\b/.test(lower);
  const wantsStats   = /\btotal\b|\bhow many\b|\bbusiest\b|\bworked most\b|\bovertime\b|\baverage\b|\bstats\b/.test(lower);
  const wantsCompare = /\bvs\b|\bversus\b|\bcompare\b/.test(lower);

  if (wantsExport || wantsExcel || wantsJson) {
    action = 'export';
    exportFormat = wantsJson ? 'json' : 'excel';
    confidence += 0.25;
  }
  if (wantsActivity) { action = 'activity'; confidence += 0.4; }
  if (wantsStats)    { action = 'stats';    confidence += 0.3; }
  if (wantsCompare)  { action = 'compare';  confidence += 0.35; }

  /* ── Quick log ───────────────────────────────────────────── */

  let quickLog: ParsedIntent['quickLog'] = null;

  const logM = lower.match(/(?:log|add)?\s*(\d+\.?\d*)\s*h(?:ours?)?\s+(?:on\s+)?(\w+)/);
  if (logM && project) {
    quickLog = { hours: parseFloat(logM[1]), projectId: project.id };
    action = 'log';
    confidence += 0.4;
  }

  if (!action && confidence > 0) action = 'filter';

  return {
    members, excludedMembers, project, client,
    datePreset, customDate, billingType, entryType,
    hoursFilter, wantsGaps, action, exportFormat, quickLog,
    wantsActivity, wantsStats, wantsCompare,
    confidence: Math.min(1, confidence),
    detectedTokens,
  };
}

function mkEaster(key: string): ParsedIntent {
  return {
    members: [], excludedMembers: [],
    project: null, client: null, datePreset: null, customDate: null,
    billingType: null, entryType: null, hoursFilter: null, wantsGaps: false,
    action: 'easter_egg', exportFormat: null, quickLog: null,
    wantsActivity: false, wantsStats: false, wantsCompare: false,
    confidence: 1, detectedTokens: [key], easterEgg: key,
  };
}

/* ── Smart label builders ───────────────────────────────────── */

export function buildSmartLabel(intent: ParsedIntent): string {
  if (intent.easterEgg === 'god_mode')  return "You're already in God Mode ✦";
  if (intent.easterEgg === 'credits')   return 'Chronicle · Built by Goku Studio with Claude · 2026';
  if (intent.easterEgg === 'konami')    return '↑ ↑ ↓ ↓ ← → ← → B A ✦';

  const parts: string[] = [];

  if      (intent.action === 'export')   parts.push('Export');
  else if (intent.action === 'log')      parts.push('Log');
  else if (intent.action === 'activity') parts.push('Show activity');
  else if (intent.action === 'stats')    parts.push('Stats for');
  else if (intent.action === 'compare')  parts.push('Compare');
  else                                   parts.push('Show');

  if (intent.members.length === 1) {
    parts.push(`${intent.members[0].name.split(' ')[0]}'s`);
  } else if (intent.members.length === 2) {
    const [a, b] = intent.members;
    parts.push(`${a.name.split(' ')[0]} & ${b.name.split(' ')[0]}'s`);
  } else if (intent.members.length > 2) {
    parts.push(`${intent.members.length} members'`);
  }

  if (intent.quickLog?.hours) parts.push(`${intent.quickLog.hours}h on`);

  if (intent.project)      parts.push(intent.project.name);
  else if (intent.client)  parts.push(intent.client.name);

  if      (intent.entryType === 'meeting') parts.push('meetings');
  else if (intent.entryType === 'task')    parts.push('tasks');
  else if (
    !intent.project && !intent.client &&
    intent.action !== 'export' &&
    intent.action !== 'activity' &&
    intent.action !== 'stats'
  ) {
    parts.push('entries');
  }

  if (intent.datePreset && intent.datePreset !== 'custom') {
    parts.push(formatDateLabel(intent.datePreset));
  } else if (intent.customDate) {
    const m = new Date(intent.customDate.start + 'T00:00:00').getMonth();
    parts.push(MONTH_NAMES[m]);
  }

  if (intent.billingType && intent.billingType !== 'all') {
    const lbl: Record<string, string> = {
      retainer: '(retainer)', out: '(out of retainer)', internal: '(internal)',
    };
    parts.push(lbl[intent.billingType] ?? '');
  }

  if (intent.exportFormat) {
    parts.push(`→ ${intent.exportFormat === 'excel' ? 'Excel' : 'JSON'}`);
  }

  return parts.join(' ');
}

export function buildSmartSubtext(intent: ParsedIntent): string {
  if (intent.easterEgg) return '';
  const tokens = [...intent.detectedTokens];
  if (intent.action === 'export')   tokens.push('→ Export page');
  if (intent.action === 'log')      tokens.push('→ Opens entry form');
  if (intent.action === 'stats')    tokens.push('→ Dashboard');
  if (intent.action === 'activity') tokens.push('→ Activity log');
  return tokens.join(' · ');
}
