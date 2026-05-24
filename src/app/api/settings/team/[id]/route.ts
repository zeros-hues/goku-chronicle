import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, initials, whatsappNumber, isActive } = await req.json()
    const member = await prisma.teamMember.update({
      where: { id: params.id },
      data: {
        name,
        initials,
        whatsappNumber: whatsappNumber || null,
        isActive,
      },
    })
    return NextResponse.json(member)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}
