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
      ...(billingType ? {
        OR: [
          { billingOverride: billingType },
          { billingOverride: null, project: { billingType } },
        ],
      } : {}),
    }

    const entries = await prisma.taskEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    const filtered = entries

    // Group by date
    const grouped: Record<string, typeof filtered> = {}
    for (const e of filtered) {
      const key = format(e.date, 'yyyy-MM-dd')
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(e)
    }

    return NextResponse.json({ grouped, total: filtered.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch export preview' }, { status: 500 })
  }
}
