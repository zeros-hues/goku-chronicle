import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { date, projectId, taskDescription, isMeeting, personCount, meetingDuration, billingOverride, hours } = body

    // Delete existing task hours then recreate
    await prisma.taskHour.deleteMany({ where: { taskEntryId: params.id } })

    const entry = await prisma.taskEntry.update({
      where: { id: params.id },
      data: {
        date: new Date(date),
        projectId: projectId || null,
        taskDescription,
        isMeeting: !!isMeeting,
        personCount: personCount ?? null,
        meetingDuration: meetingDuration ?? null,
        billingOverride: billingOverride ?? null,
        taskHours: {
          create: (hours ?? [])
            .filter((h: { teamMemberId: string; hours: number }) => h.hours > 0)
            .map((h: { teamMemberId: string; hours: number }) => ({
              teamMemberId: h.teamMemberId,
              hours: h.hours,
            })),
        },
      },
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    return NextResponse.json(entry)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await prisma.taskEntry.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
