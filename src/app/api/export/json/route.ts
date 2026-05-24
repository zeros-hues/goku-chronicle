import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingType } from '@prisma/client'
import { format } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get('startDate')
  const endDate     = searchParams.get('endDate')
  const clientId    = searchParams.get('clientId')
  const billingType = searchParams.get('billingType') as BillingType | null

  try {
    const where = {
      deletedAt: null as null,
      ...(startDate ? { date: { gte: new Date(startDate) } } : {}),
      ...(endDate   ? { date: { lte: new Date(endDate)   } } : {}),
      ...(clientId  ? { project: { clientId } } : {}),
    }

    const entries = await prisma.taskEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    const filtered = billingType
      ? entries.filter(e => (e.billingOverride ?? e.project?.billingType) === billingType)
      : entries

    const output = {
      exportDate: new Date().toISOString(),
      entries: filtered.map(e => ({
        date: format(e.date, 'yyyy-MM-dd'),
        project: e.project?.name ?? null,
        client: e.project?.client.name ?? null,
        task: e.taskDescription,
        isMeeting: e.isMeeting,
        billingType: e.billingOverride ?? e.project?.billingType ?? 'INTERNAL',
        hours: e.taskHours.map(h => ({
          member: h.teamMember.name,
          initials: h.teamMember.initials,
          hours: h.hours,
        })),
      })),
    }

    const json = JSON.stringify(output, null, 2)
    const filename = `chronicle-export-${startDate ?? 'all'}-to-${endDate ?? 'all'}.json`

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate JSON export' }, { status: 500 })
  }
}
