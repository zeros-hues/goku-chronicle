import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { holidays: { orderBy: { date: 'asc' } } },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json({
      hoursTarget: user.hoursTarget,
      overtimeThreshold: user.overtimeThreshold,
      reminderEnabled: user.reminderEnabled,
      reminderTime: user.reminderTime,
      holidays: user.holidays,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch account settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { hoursTarget, overtimeThreshold } = await req.json()
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { hoursTarget, overtimeThreshold },
    })
    return NextResponse.json({ hoursTarget: user.hoursTarget, overtimeThreshold: user.overtimeThreshold })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update account settings' }, { status: 500 })
  }
}
