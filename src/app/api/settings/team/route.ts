import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const members = await prisma.teamMember.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(members)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, initials, whatsappNumber, isActive } = await req.json()
    const member = await prisma.teamMember.create({
      data: {
        name,
        initials,
        whatsappNumber: whatsappNumber || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    })
    return NextResponse.json(member, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 })
  }
}
