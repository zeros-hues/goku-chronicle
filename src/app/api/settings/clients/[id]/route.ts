import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, hasRetainership } = await req.json()
    const client = await prisma.client.update({
      where: { id: params.id },
      data: { name, hasRetainership: !!hasRetainership },
      include: { projects: { orderBy: { name: 'asc' } } },
    })
    return NextResponse.json(client)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
  }
}
