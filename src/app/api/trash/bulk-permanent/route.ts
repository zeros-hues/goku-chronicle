import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { ids } = await req.json()
    await prisma.taskEntry.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ success: true, count: ids.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to bulk permanent delete' }, { status: 500 })
  }
}
