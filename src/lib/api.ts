import { getColorFromSeed } from '@/lib/data'
import type { Entry, Client, Member, BillingType, Project } from '@/lib/data'

/* ── Billing enum conversion ─────────────────────────────────── */

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

/* ── Sequential number ID ↔ backend cuid mapping ───────────── */

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

/* ── Backend response shapes ─────────────────────────────────── */

interface BackendTaskHour {
  teamMemberId: string
  hours: number
  teamMember: { id: string; initials: string }
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
  effectiveBilling: string | null
  deletedAt: string | null
  createdAt: string
  project: {
    id: string
    name: string
    billingType: string
    client: { id: string; name: string }
  } | null
  taskHours: BackendTaskHour[]
}

interface BackendProject {
  id: string
  name: string
  clientId: string
  billingType: string
  archivedAt: string | null
  client?: { id: string; name: string; hasRetainership: boolean }
}

interface BackendClient {
  id: string
  name: string
  hasRetainership: boolean
  projects: BackendProject[]
}

interface BackendMember {
  id: string
  name: string
  initials: string
  whatsappNumber: string | null
  isActive: boolean
}

interface BackendHoliday {
  id: string
  date: string
  label: string | null
}

/* ── Conversion helpers ──────────────────────────────────────── */

function backendProjectToBilling(billingType: string): BillingType {
  return billingToFrontend[billingType] ?? 'internal'
}

export function toFrontendProject(p: BackendProject): Project {
  return {
    id: p.id,
    name: p.name,
    color: getColorFromSeed(p.id),
    billing: backendProjectToBilling(p.billingType),
    archivedAt: p.archivedAt ?? null,
  }
}

export function toFrontendClient(c: BackendClient): Client {
  return {
    id: c.id,
    name: c.name,
    type: c.hasRetainership ? 'client' : 'internal',
    hasRetainership: c.hasRetainership,
    projects: c.projects.map(toFrontendProject),
  }
}

export function toFrontendMember(m: BackendMember, index: number): Member {
  return {
    id: m.id,
    name: m.name,
    init: m.initials,
    avatarClass: `av-${index % 8}`,
    color: getColorFromSeed(m.id),
    active: m.isActive,
    wa: m.whatsappNumber ?? '',
  }
}

function toFrontendEntry(b: BackendEntry): Entry {
  const billingKey = (b.effectiveBilling ?? b.billingOverride ?? b.project?.billingType ?? 'INTERNAL') as string
  const billing = (billingToFrontend[billingKey] ?? 'internal') as BillingType

  const hours: Record<string, number> = {}
  for (const th of b.taskHours) {
    hours[th.teamMemberId] = th.hours
  }

  return {
    id: assignId(b.id),
    date: b.date.slice(0, 10),
    projectId: b.projectId ?? '',
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

function toBackendPayload(e: Entry) {
  const hours = Object.entries(e.hours)
    .filter(([, h]) => h > 0)
    .map(([teamMemberId, h]) => ({ teamMemberId, hours: h }))

  return {
    date: e.date,
    projectId: e.projectId || null,
    taskDescription: e.task,
    isMeeting: e.type === 'meeting',
    personCount: e.meetingPeople ?? null,
    meetingDuration: e.meetingDuration ?? null,
    billingOverride: null as string | null,
    hours,
  }
}

/* ── Timesheet entry functions ──────────────────────────────── */

export async function fetchEntries(): Promise<Entry[]> {
  const res = await fetch('/api/timesheet')
  if (!res.ok) throw new Error('Failed to fetch entries')
  const { entries } = await res.json() as { entries: BackendEntry[] }
  return entries.map(toFrontendEntry)
}

export async function fetchTrash(): Promise<Entry[]> {
  const res = await fetch('/api/trash')
  if (!res.ok) throw new Error('Failed to fetch trash')
  const entries = await res.json() as BackendEntry[]
  return entries.map(toFrontendEntry)
}

export async function createEntry(e: Entry): Promise<Entry> {
  const payload = toBackendPayload(e)
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
  const payload = toBackendPayload(e)
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
  entries: Entry[],
  memberById: Record<string, Member>,
  projectById: Record<string, Project & { clientId: string; clientName: string }>,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const parsedEntries = entries.map(e => {
    const proj = projectById[e.projectId]
    return {
      date: e.date,
      projectName: proj?.name ?? e.projectId,
      clientName: proj?.clientName ?? '',
      taskDescription: e.task,
      isMeeting: e.type === 'meeting',
      personCount: e.meetingPeople,
      meetingDuration: e.meetingDuration,
      hours: Object.entries(e.hours)
        .filter(([, h]) => h > 0)
        .map(([memberId, h]) => ({
          memberInitials: memberById[memberId]?.init ?? memberId,
          hours: h,
        })),
    }
  })

  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: parsedEntries, skipDuplicates: true }),
  })
  if (!res.ok) throw new Error('Import failed')
  return res.json() as Promise<{ imported: number; skipped: number; errors: string[] }>
}

/* ── Settings — clients ─────────────────────────────────────── */

export async function fetchClients(): Promise<Client[]> {
  const res = await fetch('/api/settings/clients')
  if (!res.ok) throw new Error('Failed to fetch clients')
  const data = await res.json() as BackendClient[]
  return data.map(toFrontendClient)
}

export async function createClient(name: string, hasRetainership: boolean): Promise<Client> {
  const res = await fetch('/api/settings/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, hasRetainership }),
  })
  if (!res.ok) {
    const { error } = await res.json() as { error: string }
    throw new Error(error ?? 'Failed to create client')
  }
  return toFrontendClient(await res.json() as BackendClient)
}

export async function updateClient(id: string, name: string, hasRetainership: boolean): Promise<Client> {
  const res = await fetch(`/api/settings/clients/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, hasRetainership }),
  })
  if (!res.ok) throw new Error('Failed to update client')
  return toFrontendClient(await res.json() as BackendClient)
}

/* ── Settings — projects ────────────────────────────────────── */

export async function createProject(clientId: string, name: string, billing: BillingType): Promise<Project> {
  const res = await fetch('/api/settings/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, clientId, billingType: billingToBackend[billing] }),
  })
  if (!res.ok) {
    const { error } = await res.json() as { error: string }
    throw new Error(error ?? 'Failed to create project')
  }
  return toFrontendProject(await res.json() as BackendProject)
}

export async function updateProject(id: string, name: string, billing: BillingType): Promise<Project> {
  const res = await fetch(`/api/settings/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, billingType: billingToBackend[billing] }),
  })
  if (!res.ok) throw new Error('Failed to update project')
  return toFrontendProject(await res.json() as BackendProject)
}

export async function archiveProject(id: string): Promise<Project> {
  const res = await fetch(`/api/settings/projects/${id}/archive`, {
    method: 'PATCH',
  })
  if (!res.ok) throw new Error('Failed to archive project')
  return toFrontendProject(await res.json() as BackendProject)
}

/* ── Settings — team members ────────────────────────────────── */

export async function fetchMembers(): Promise<Member[]> {
  const res = await fetch('/api/settings/team')
  if (!res.ok) throw new Error('Failed to fetch team members')
  const data = await res.json() as BackendMember[]
  return data.map(toFrontendMember)
}

export async function createMember(name: string, initials: string, whatsappNumber?: string): Promise<Member> {
  const allMembers = await fetchMembers()
  const res = await fetch('/api/settings/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, initials, whatsappNumber: whatsappNumber || null }),
  })
  if (!res.ok) {
    const { error } = await res.json() as { error: string }
    throw new Error(error ?? 'Failed to create member')
  }
  return toFrontendMember(await res.json() as BackendMember, allMembers.length)
}

export async function updateMember(id: string, data: { name?: string; whatsappNumber?: string; isActive?: boolean }, index: number): Promise<Member> {
  const res = await fetch(`/api/settings/team/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update member')
  return toFrontendMember(await res.json() as BackendMember, index)
}

export async function deactivateMember(id: string, isActive: boolean, index: number): Promise<Member> {
  const res = await fetch(`/api/settings/team/${id}/deactivate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  })
  if (!res.ok) throw new Error('Failed to update member')
  return toFrontendMember(await res.json() as BackendMember, index)
}

/* ── Settings — account ─────────────────────────────────────── */

export interface AccountSettings {
  hoursTarget: number
  overtimeThreshold: number
  reminderEnabled: boolean
  reminderTime: string
  holidays: BackendHoliday[]
}

export async function fetchAccount(): Promise<AccountSettings> {
  const res = await fetch('/api/settings/account')
  if (!res.ok) throw new Error('Failed to fetch account settings')
  return res.json() as Promise<AccountSettings>
}

export async function updateAccount(data: { hoursTarget?: number; overtimeThreshold?: number }): Promise<void> {
  const res = await fetch('/api/settings/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update account settings')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/settings/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) {
    const { error } = await res.json() as { error: string }
    throw new Error(error ?? 'Failed to change password')
  }
}

export async function addHoliday(date: string, label: string): Promise<BackendHoliday> {
  const res = await fetch('/api/settings/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, label }),
  })
  if (!res.ok) throw new Error('Failed to add holiday')
  return res.json() as Promise<BackendHoliday>
}

export async function removeHoliday(id: string): Promise<void> {
  const res = await fetch(`/api/settings/holidays/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove holiday')
}

export { billingToBackend, billingToFrontend }
