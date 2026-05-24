import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const entry = await prisma.taskEntry.update({
      where: { id: params.id },
      data: { deletedAt: null },
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })
    return NextResponse.json(entry)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to restore entry' }, { status: 500 })
  }
}
