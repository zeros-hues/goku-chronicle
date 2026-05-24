import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface ParsedHour {
  memberInitials: string
  hours: number
}

interface ParsedEntry {
  date: string
  projectName: string
  clientName: string
  taskDescription: string
  isMeeting: boolean
  personCount?: number
  meetingDuration?: number
  hours: ParsedHour[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { entries, skipDuplicates } = await req.json() as {
      entries: ParsedEntry[]
      skipDuplicates: boolean
    }

    // Prefetch all projects and team members
    const allProjects = await prisma.project.findMany({ include: { client: true } })
    const allMembers  = await prisma.teamMember.findMany()

    let imported = 0
    let skipped  = 0
    const errors: string[] = []

    for (const entry of entries) {
      // Find project (case-insensitive name + client)
      const project = allProjects.find(
        p =>
          p.name.toLowerCase() === entry.projectName.toLowerCase() &&
          p.client.name.toLowerCase() === entry.clientName.toLowerCase()
      )
      if (!project) {
        errors.push(`Project "${entry.projectName}" for client "${entry.clientName}" not found`)
        skipped++
        continue
      }

      // Check for duplicate
      const entryDate = new Date(entry.date)
      const duplicate = await prisma.taskEntry.findFirst({
        where: {
          date: entryDate,
          projectId: project.id,
          taskDescription: entry.taskDescription,
          deletedAt: null,
        },
      })
      if (duplicate) {
        if (skipDuplicates) { skipped++; continue }
        errors.push(`Duplicate entry for "${entry.taskDescription}" on ${entry.date}`)
        skipped++
        continue
      }

      // Resolve team members by initials
      const hours = (entry.hours ?? []).map((h: ParsedHour) => {
        const member = allMembers.find(
          m => m.initials.toLowerCase() === h.memberInitials.toLowerCase()
        )
        return member ? { teamMemberId: member.id, hours: h.hours } : null
      }).filter(Boolean) as { teamMemberId: string; hours: number }[]

      await prisma.taskEntry.create({
        data: {
          date: entryDate,
          projectId: project.id,
          taskDescription: entry.taskDescription,
          isMeeting: entry.isMeeting,
          personCount: entry.personCount ?? null,
          meetingDuration: entry.meetingDuration ?? null,
          taskHours: { create: hours },
        },
      })
      imported++
    }

    return NextResponse.json({ imported, skipped, errors })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to import entries' }, { status: 500 })
  }
}
