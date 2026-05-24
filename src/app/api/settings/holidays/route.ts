import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { date, label } = await req.json()
    const holiday = await prisma.holiday.create({
      data: {
        userId: session.user.id,
        date: new Date(date),
        label: label || null,
      },
    })
    return NextResponse.json(holiday, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to add holiday' }, { status: 500 })
  }
}
