import type { PaletteData, PaletteRawMember, PaletteRawProject, AliasMaps } from './types';

/* ── API fetch ───────────────────────────────────────────────── */

export async function fetchPaletteData(): Promise<PaletteData> {
  const [clientsRes, teamRes] = await Promise.all([
    fetch('/api/settings/clients'),
    fetch('/api/settings/team'),
  ]);

  if (!clientsRes.ok || !teamRes.ok) throw new Error('fetch failed');

  const clientsData = await clientsRes.json();
  const teamData    = await teamRes.json();

  const projects: PaletteRawProject[] = clientsData.flatMap((c: any) =>
    (c.projects ?? []).map((p: any) => ({
      id:         p.id,
      name:       p.name,
      color:      p.color,
      billing:    p.billing,
      archivedAt: p.archivedAt ?? null,
      clientId:   c.id,
      clientName: c.name,
    }))
  );

  return {
    members: teamData.map((m: any) => ({
      id:     m.id,
      name:   m.name ?? '',
      init:   m.init ?? m.initials ?? '',
      color:  m.color ?? 'var(--ink-ghost)',
      active: m.active ?? true,
    })),
    projects,
    clients: clientsData,
  };
}

/* ── Levenshtein ─────────────────────────────────────────────── */

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/* ── Alias map builder ───────────────────────────────────────── */

export function buildAliasMap(data: PaletteData): AliasMaps {
  const memberAliases  = new Map<string, PaletteRawMember>();
  const projectAliases = new Map<string, PaletteRawProject>();

  for (const m of data.members) {
    if (!m.name) continue;
    const nameLower = m.name.toLowerCase();
    const initLower = m.init ? m.init.toLowerCase() : '';

    memberAliases.set(nameLower, m);
    if (initLower) memberAliases.set(initLower, m);

    const firstName = nameLower.split(' ')[0];
    if (!memberAliases.has(firstName)) memberAliases.set(firstName, m);

    for (const word of nameLower.split(' ')) {
      if (word.length > 2 && !memberAliases.has(word)) memberAliases.set(word, m);
    }
  }

  for (const p of data.projects) {
    const nameLower = p.name.toLowerCase();

    projectAliases.set(nameLower, p);

    if (nameLower.length > 5) {
      projectAliases.set(nameLower.slice(0, 3), p);
      projectAliases.set(nameLower.slice(0, 4), p);
    }

    for (const word of nameLower.split(' ')) {
      if (word.length > 2 && !projectAliases.has(word)) projectAliases.set(word, p);
    }

    projectAliases.set(`${p.clientName.toLowerCase()} ${nameLower}`, p);
  }

  return { memberAliases, projectAliases };
}

/* ── Fuzzy finders ───────────────────────────────────────────── */

export function fuzzyFindMember(
  query: string,
  members: PaletteRawMember[],
  memberAliases: AliasMaps['memberAliases'],
): PaletteRawMember | null {
  const q = query.toLowerCase();
  const exact = memberAliases.get(q);
  if (exact) return exact;

  const threshold = q.length > 6 ? 3 : 2;
  return members.find(m => {
    if (!m.name) return false;
    const nd = levenshtein(q, m.name.toLowerCase());
    const id = m.init ? levenshtein(q, m.init.toLowerCase()) : nd;
    return Math.min(nd, id) <= threshold;
  }) ?? null;
}

export function fuzzyFindProject(
  query: string,
  projects: PaletteRawProject[],
  projectAliases: AliasMaps['projectAliases'],
): PaletteRawProject | null {
  const q = query.toLowerCase();
  const exact = projectAliases.get(q);
  if (exact) return exact;

  const threshold = q.length > 6 ? 3 : 2;
  return projects.find(p =>
    levenshtein(q, p.name.toLowerCase()) <= threshold
  ) ?? null;
}
