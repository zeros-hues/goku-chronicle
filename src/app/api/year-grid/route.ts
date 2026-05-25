import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

export async function GET() {
  // Public endpoint — no auth required
  try {
    const year = new Date().getFullYear()
    const start = new Date(year, 0, 1)
    const end   = new Date(year, 11, 31, 23, 59, 59)

    const entries = await prisma.taskEntry.findMany({
      where: {
        deletedAt: null,
        date: { gte: start, lte: end },
      },
      include: { taskHours: true },
    })

    const days: Record<string, number> = {}
    for (const entry of entries) {
      const dateStr = format(entry.date, 'yyyy-MM-dd')
      let h = 0
      if (entry.isMeeting) {
        h = (entry.meetingDuration ?? 0)
      } else {
        h = entry.taskHours.reduce((s, th) => s + th.hours, 0)
      }
      days[dateStr] = (days[dateStr] ?? 0) + h
    }

    const totalHours = Object.values(days).reduce((a, b) => a + b, 0)
    const totalEntries = entries.length
    const projectCount = new Set(entries.map(e => e.projectId).filter(Boolean)).size

    return NextResponse.json({ year, days, totalHours, totalEntries, projectCount })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch year grid' }, { status: 500 })
  }
}
