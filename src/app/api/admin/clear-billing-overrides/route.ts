import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// One-time cleanup: clear billingOverride values that are redundant (match project's own billingType).
// After this runs, all entries correctly inherit billing from their project.
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const entries = await prisma.taskEntry.findMany({
      where: { billingOverride: { not: null } },
      include: { project: true },
    })

    let cleared = 0
    for (const entry of entries) {
      if (entry.billingOverride === entry.project?.billingType) {
        await prisma.taskEntry.update({
          where: { id: entry.id },
          data: { billingOverride: null },
        })
        cleared++
      }
    }

    return NextResponse.json({ cleared, total: entries.length })
  } catch (e) {
    console.error('[clear-billing-overrides]', e)
    return NextResponse.json({ error: 'Failed to clear billing overrides' }, { status: 500 })
  }
}
