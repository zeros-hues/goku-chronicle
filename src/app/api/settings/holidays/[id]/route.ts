import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const holiday = await prisma.holiday.findUnique({ where: { id: params.id } })
    if (!holiday) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 })
    if (holiday.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.holiday.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 })
  }
}
