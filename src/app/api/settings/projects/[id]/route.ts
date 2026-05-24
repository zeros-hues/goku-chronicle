import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingType } from '@prisma/client'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, billingType } = await req.json()
    const project = await prisma.project.update({
      where: { id: params.id },
      data: { name, billingType: billingType as BillingType },
      include: { client: true },
    })
    return NextResponse.json(project)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}
