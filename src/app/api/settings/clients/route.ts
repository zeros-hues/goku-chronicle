import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const clients = await prisma.client.findMany({
      include: { projects: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(clients)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, hasRetainership } = await req.json()
    const client = await prisma.client.create({
      data: { name, hasRetainership: !!hasRetainership },
      include: { projects: true },
    })
    return NextResponse.json(client, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
