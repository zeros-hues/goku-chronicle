import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingType, Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')
  const clientId   = searchParams.get('clientId')
  const billingType = searchParams.get('billingType') as BillingType | null
  const memberId   = searchParams.get('memberId')
  const search     = searchParams.get('search')

  const where: Prisma.TaskEntryWhereInput = {
    deletedAt: null,
  }

  if (startDate) where.date = { ...((where.date as object) ?? {}), gte: new Date(startDate) }
  if (endDate)   where.date = { ...((where.date as object) ?? {}), lte: new Date(endDate) }

  if (clientId) {
    where.project = { clientId }
  }

  if (billingType) {
    where.OR = [
      { billingOverride: billingType },
      { AND: [{ billingOverride: null }, { project: { billingType } }] },
    ]
  }

  if (memberId) {
    where.taskHours = { some: { teamMemberId: memberId } }
  }

  if (search) {
    const s = search.toLowerCase()
    where.OR = [
      ...(where.OR ?? []),
      { taskDescription: { contains: s, mode: 'insensitive' } },
      { project: { name: { contains: s, mode: 'insensitive' } } },
    ]
  }

  try {
    const entries = await prisma.taskEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    const totalHours = entries.reduce((sum, e) => {
      if (e.isMeeting) return sum + (e.meetingDuration ?? 0)
      return sum + e.taskHours.reduce((s, h) => s + h.hours, 0)
    }, 0)

    const formatted = entries.map(e => ({
      ...e,
      effectiveBilling: e.billingOverride ?? e.project?.billingType ?? null,
    }))

    return NextResponse.json({ entries: formatted, totalHours, count: formatted.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { date, projectId, taskDescription, isMeeting, personCount, meetingDuration, billingOverride, hours } = body

    const entry = await prisma.taskEntry.create({
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

    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}
