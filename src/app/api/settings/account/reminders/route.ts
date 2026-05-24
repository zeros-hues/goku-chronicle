import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { reminderEnabled, reminderTime } = await req.json()
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { reminderEnabled, reminderTime },
    })
    return NextResponse.json({ reminderEnabled: user.reminderEnabled, reminderTime: user.reminderTime })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update reminder settings' }, { status: 500 })
  }
}
