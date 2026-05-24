import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const entries = await prisma.taskEntry.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })
    return NextResponse.json(entries)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch trash' }, { status: 500 })
  }
}
