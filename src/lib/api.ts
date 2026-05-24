import { MEMBERS, ALL_PROJECTS } from '@/lib/data'
import type { Entry, BillingType } from '@/lib/data'

/* ── Static lookup tables built from frontend data.ts ───────── */

const billingToFrontend: Record<string, BillingType> = {
  RETAINERSHIP: 'retainer',
  OUT_OF_RETAINERSHIP: 'out',
  INTERNAL: 'internal',
}

const billingToBackend: Record<string, string> = {
  retainer: 'RETAINERSHIP',
  out: 'OUT_OF_RETAINERSHIP',
  internal: 'INTERNAL',
}

// initials.toLowerCase() → frontend member id ('G' → 'g', 'Pd' → 'pd')
const initToMemberId: Record<string, string> = {}
for (const m of MEMBERS) initToMemberId[m.init.toLowerCase()] = m.id

// frontend member id → initials ('g' → 'G')
const memberIdToInit: Record<string, string> = {}
for (const m of MEMBERS) memberIdToInit[m.id] = m.init

// project name.toLowerCase() → frontend project id ('autoref' → 'autoref', '3d microscope' → '3dmicro')
const nameToProjectId: Record<string, string> = {}
for (const p of ALL_PROJECTS) nameToProjectId[p.name.toLowerCase()] = p.id

// frontend project id → project name ('autoref' → 'Autoref')
const projectIdToName: Record<string, string> = {}
for (const p of ALL_PROJECTS) projectIdToName[p.id] = p.name

// frontend project id → client name ('autoref' → 'Appasamy')
const projectIdToClient: Record<string, string> = {}
for (const p of ALL_PROJECTS) projectIdToClient[p.id] = (p as { clientName: string }).clientName

/* ── Dynamic lookup tables fetched from API on first use ────── */

const memberInitToBackendId: Record<string, string> = {} // initials.lower → backend cuid
const projectNameToBackendId: Record<string, string> = {} // name.lower → backend cuid
let mapsLoaded = false

async function ensureMaps() {
  if (mapsLoaded) return
  try {
    const [teamRes, clientsRes] = await Promise.all([
      fetch('/api/settings/team'),
      fetch('/api/settings/clients'),
    ])
    if (!teamRes.ok || !clientsRes.ok) return

    const members = await teamRes.json() as { id: string; initials: string }[]
    const clients = await clientsRes.json() as { projects: { id: string; name: string }[] }[]

    for (const m of members) {
      memberInitToBackendId[m.initials.toLowerCase()] = m.id
    }
    for (const c of clients) {
      for (const p of c.projects) {
        projectNameToBackendId[p.name.toLowerCase()] = p.id
      }
    }
    mapsLoaded = true
  } catch {
    // Maps unavailable — API calls will gracefully degrade
  }
}

/* ── Sequential number ID ↔ backend cuid mapping ────────────── */

let idSeq = 1_000_000
const cuidToNum = new Map<string, number>()
const numToCuid = new Map<number, string>()

function assignId(cuid: string): number {
  if (cuidToNum.has(cuid)) return cuidToNum.get(cuid)!
  const id = ++idSeq
  cuidToNum.set(cuid, id)
  numToCuid.set(id, cuid)
  return id
}

function getBackendId(frontendId: number): string | undefined {
  return numToCuid.get(frontendId)
}

/* ── Backend response shape ─────────────────────────────────── */

interface BackendTaskHour {
  teamMemberId: string
  hours: number
  teamMember: { initials: string }
}

interface BackendEntry {
  id: string
  date: string
  projectId: string | null
  taskDescription: string
  isMeeting: boolean
  personCount: number | null
  meetingDuration: number | null
  billingOverride: string | null
  deletedAt: string | null
  createdAt: string
  project: {
    id: string
    name: string
    billingType: string
    client: { name: string }
  } | null
  taskHours: BackendTaskHour[]
}

/* ── Backend → Frontend transformation ─────────────────────── */

function toFrontendEntry(b: BackendEntry): Entry {
  const frontendProjectId = b.project
    ? (nameToProjectId[b.project.name.toLowerCase()] ?? b.project.id)
    : ''

  const billingKey = (b.billingOverride ?? b.project?.billingType ?? 'INTERNAL') as string
  const billing = (billingToFrontend[billingKey] ?? 'internal') as BillingType

  const hours: Record<string, number> = {}
  for (const th of b.taskHours) {
    const memberId = initToMemberId[th.teamMember.initials.toLowerCase()]
    if (memberId) hours[memberId] = th.hours
  }

  return {
    id: assignId(b.id),
    date: b.date.slice(0, 10),
    projectId: frontendProjectId,
    type: b.isMeeting ? 'meeting' : 'task',
    task: b.taskDescription,
    billing,
    hours,
    meetingDuration: b.meetingDuration ?? undefined,
    meetingPeople: b.personCount ?? undefined,
    createdAt: new Date(b.createdAt).getTime(),
    trashed: b.deletedAt !== null,
  }
}

/* ── Frontend → Backend payload ─────────────────────────────── */

async function toBackendPayload(e: Entry) {
  await ensureMaps()

  const projectName = projectIdToName[e.projectId]
  const backendProjectId = projectName
    ? (projectNameToBackendId[projectName.toLowerCase()] ?? null)
    : null

  const hours = Object.entries(e.hours)
    .filter(([, h]) => h > 0)
    .map(([memberId, h]) => {
      const init = memberIdToInit[memberId]?.toLowerCase()
      const backendMemberId = init ? memberInitToBackendId[init] : undefined
      return backendMemberId ? { teamMemberId: backendMemberId, hours: h } : null
    })
    .filter((x): x is { teamMemberId: string; hours: number } => x !== null)

  return {
    date: e.date,
    projectId: backendProjectId,
    taskDescription: e.task,
    isMeeting: e.type === 'meeting',
    personCount: e.meetingPeople ?? null,
    meetingDuration: e.meetingDuration ?? null,
    billingOverride: null as string | null,
    hours,
  }
}

/* ── Public API functions ───────────────────────────────────── */

export async function fetchEntries(): Promise<Entry[]> {
  await ensureMaps()
  const res = await fetch('/api/timesheet')
  if (!res.ok) throw new Error('Failed to fetch entries')
  const { entries } = await res.json() as { entries: BackendEntry[] }
  return entries.map(toFrontendEntry)
}

export async function fetchTrash(): Promise<Entry[]> {
  await ensureMaps()
  const res = await fetch('/api/trash')
  if (!res.ok) throw new Error('Failed to fetch trash')
  const entries = await res.json() as BackendEntry[]
  return entries.map(toFrontendEntry)
}

export async function createEntry(e: Entry): Promise<Entry> {
  const payload = await toBackendPayload(e)
  const res = await fetch('/api/timesheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create entry')
  return toFrontendEntry(await res.json() as BackendEntry)
}

export async function updateEntry(e: Entry): Promise<Entry> {
  const backendId = getBackendId(e.id)
  if (!backendId) throw new Error('Cannot update: backend ID not found')
  const payload = await toBackendPayload(e)
  const res = await fetch(`/api/timesheet/${backendId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update entry')
  return toFrontendEntry(await res.json() as BackendEntry)
}

export async function trashEntries(ids: number[]): Promise<void> {
  const backendIds = ids.map(id => getBackendId(id)).filter((x): x is string => !!x)
  if (!backendIds.length) return
  await fetch('/api/timesheet/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: backendIds }),
  })
}

export async function restoreEntries(ids: number[]): Promise<void> {
  const backendIds = ids.map(id => getBackendId(id)).filter((x): x is string => !!x)
  if (!backendIds.length) return
  await fetch('/api/trash/bulk-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: backendIds }),
  })
}

export async function permanentDeleteEntries(ids: number[]): Promise<void> {
  const backendIds = ids.map(id => getBackendId(id)).filter((x): x is string => !!x)
  if (!backendIds.length) return
  await fetch('/api/trash/bulk-permanent', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: backendIds }),
  })
}

export async function importEntries(
  entries: Entry[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  await ensureMaps()

  const parsedEntries = entries.map(e => ({
    date: e.date,
    projectName: projectIdToName[e.projectId] ?? e.projectId,
    clientName: projectIdToClient[e.projectId] ?? '',
    taskDescription: e.task,
    isMeeting: e.type === 'meeting',
    personCount: e.meetingPeople,
    meetingDuration: e.meetingDuration,
    hours: Object.entries(e.hours)
      .filter(([, h]) => h > 0)
      .map(([memberId, h]) => ({
        memberInitials: memberIdToInit[memberId] ?? memberId,
        hours: h,
      })),
  }))

  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: parsedEntries, skipDuplicates: true }),
  })
  if (!res.ok) throw new Error('Import failed')
  return res.json() as Promise<{ imported: number; skipped: number; errors: string[] }>
}

export { billingToBackend, billingToFrontend }
