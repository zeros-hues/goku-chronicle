import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { ids } = await req.json()
    await prisma.taskEntry.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null },
    })
    return NextResponse.json({ success: true, count: ids.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to bulk restore' }, { status: 500 })
  }
}
