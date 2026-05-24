import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingType } from '@prisma/client'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name, clientId, billingType } = await req.json()
    const project = await prisma.project.create({
      data: { name, clientId, billingType: billingType as BillingType },
      include: { client: true },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
