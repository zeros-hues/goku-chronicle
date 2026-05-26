import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface ParsedHour {
  memberInitials?: string
  initials?: string
  member?: string
  hours: number
}

interface ParsedEntry {
  date: string
  project?: string
  projectName?: string
  client?: string
  clientName?: string
  task?: string
  taskDescription?: string
  isMeeting: boolean
  personCount?: number
  meetingDuration?: number
  billingType?: string
  hours?: ParsedHour[]
}

type ProjectWithClient = {
  id: string
  name: string
  clientId: string
  billingType: string
  archivedAt: Date | null
  createdAt: Date
  client: {
    id: string
    name: string
    hasRetainership: boolean
    createdAt: Date
  }
}

type TeamMemberRecord = {
  id: string
  name: string
  initials: string
  whatsappNumber: string | null
  isActive: boolean
  createdAt: Date
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { entries, skipDuplicates = true } = await req.json() as {
      entries: ParsedEntry[]
      skipDuplicates: boolean
    }

    const allProjects = await prisma.project.findMany({ include: { client: true } })
    const allMembers  = await prisma.teamMember.findMany()

    let imported = 0
    let skipped  = 0
    const errors: string[] = []

    for (const entry of entries) {
      const projectName     = (entry.projectName || entry.project     || '').trim()
      const clientName      = (entry.clientName  || entry.client      || '').trim()
      const taskDescription = (entry.taskDescription || entry.task    || 'Untitled Task').trim()

      // Match project by name + client (case-insensitive)
      const project = allProjects.find(
        (p: ProjectWithClient) =>
          p.name.toLowerCase() === projectName.toLowerCase() &&
          p.client.name.toLowerCase() === clientName.toLowerCase()
      )

      if (!project) {
        errors.push(`Project "${projectName}" for client "${clientName}" not found — skipped`)
        skipped++
        continue
      }

      // Parse date without UTC timezone shift
      // Splits "2026-04-01" → local midnight, not UTC midnight
      const parts = entry.date.split('-').map(Number)
      const year  = parts[0]
      const month = parts[1]
      const day   = parts[2]
      const entryDate = new Date(year, month - 1, day)

      // Duplicate check: same date + project + task description
      const duplicate = await prisma.taskEntry.findFirst({
        where: {
          date:            entryDate,
          projectId:       project.id,
          taskDescription,
          deletedAt:       null,
        },
      })

      if (duplicate) {
        skipped++
        if (!skipDuplicates) {
          errors.push(`Duplicate: "${taskDescription}" on ${entry.date}`)
        }
        continue
      }

      // Resolve team members by initials
      const taskHours = (entry.hours ?? [])
        .map((h: ParsedHour) => {
          const initials = (h.memberInitials || h.initials || '').trim()
          if (!initials) return null

          const member = allMembers.find(
            (m: TeamMemberRecord) =>
              m.initials.toLowerCase() === initials.toLowerCase()
          )

          if (!member) {
            errors.push(`Member "${initials}" not found — hours skipped`)
            return null
          }

          return { teamMemberId: member.id, hours: Number(h.hours) }
        })
        .filter((h): h is { teamMemberId: string; hours: number } => h !== null)

      await prisma.taskEntry.create({
        data: {
          date:            entryDate,
          projectId:       project.id,
          taskDescription,
          isMeeting:       entry.isMeeting       ?? false,
          personCount:     entry.personCount      ?? null,
          meetingDuration: entry.meetingDuration  ?? null,
          source:          'MANUAL',
          taskHours:       { create: taskHours },
          // billingOverride intentionally omitted — inherits from project
        },
      })

      imported++
    }

    return NextResponse.json({ imported, skipped, errors })

  } catch (e) {
    console.error('[import]', e)
    return NextResponse.json({ error: 'Failed to import entries' }, { status: 500 })
  }
}