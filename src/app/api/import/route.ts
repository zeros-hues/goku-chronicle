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
  projectName?: string
  project?: string
  clientName?: string
  client?: string
  taskDescription?: string
  task?: string
  isMeeting: boolean
  personCount?: number
  meetingDuration?: number
  hours?: ParsedHour[]
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
      // Safe extraction mapping both interface keys and JSON keys
      const safeProjectName = entry.projectName || entry.project || ""
      const safeClientName = entry.clientName || entry.client || ""
      const safeTaskDescription = entry.taskDescription || entry.task || "Untitled Task"

      // Find project safely with inline TypeScript typing for the nested client
      const project = allProjects.find(
        (p: { id: string; name: string; client: { name: string } }) =>
          p.name.toLowerCase() === safeProjectName.toLowerCase() &&
          p.client.name.toLowerCase() === safeClientName.toLowerCase()
      )

      if (!project) {
        errors.push(`Project "${safeProjectName}" for client "${safeClientName}" not found`)
        skipped++
        continue
      }

      // Check for duplicate
      const entryDate = new Date(entry.date)
      const duplicate = await prisma.taskEntry.findFirst({
        where: {
          date: entryDate,
          projectId: project.id,
          taskDescription: safeTaskDescription,
          deletedAt: null,
        },
      })

      if (duplicate) {
        if (skipDuplicates) { skipped++; continue }
        errors.push(`Duplicate entry for "${safeTaskDescription}" on ${entry.date}`)
        skipped++
        continue
      }

      // Resolve team members safely with inline TypeScript typing
      const hours = (entry.hours ?? []).map((h: ParsedHour) => {
        const safeInitials = h.memberInitials || h.initials || ""
        
        if (!safeInitials) return null

        const member = allMembers.find(
          (m: { id: string; initials: string }) => m.initials.toLowerCase() === safeInitials.toLowerCase()
        )
        return member ? { teamMemberId: member.id, hours: h.hours } : null
      }).filter(Boolean) as { teamMemberId: string; hours: number }[]

      // Create the entry
      await prisma.taskEntry.create({
        data: {
          date: entryDate,
          projectId: project.id,
          taskDescription: safeTaskDescription,
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