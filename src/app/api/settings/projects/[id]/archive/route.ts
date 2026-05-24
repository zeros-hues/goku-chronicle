import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const project = await prisma.project.findUnique({ where: { id: params.id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: { archivedAt: project.archivedAt ? null : new Date() },
      include: { client: true },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to toggle archive' }, { status: 500 })
  }
}
