import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now      = new Date()
    const lastWeek = subWeeks(now, 1)
    const weekStart = startOfWeek(lastWeek, { weekStartsOn: 1 }) // Monday
    const weekEnd   = endOfWeek(lastWeek,   { weekStartsOn: 1 }) // Sunday

    const entries = await prisma.taskEntry.findMany({
      where: {
        deletedAt: null,
        date: { gte: weekStart, lte: weekEnd },
      },
      include: {
        project: true,
        taskHours: { include: { teamMember: true } },
      },
    })

    // Studio total hours
    let studioTotal = 0
    const memberHours: Record<string, number> = {}
    const projectHours: Record<string, { name: string; hours: number }> = {}

    for (const entry of entries) {
      let entryHours = 0
      if (entry.isMeeting) {
        entryHours = (entry.meetingDuration ?? 0) * (entry.personCount ?? 0)
      } else {
        entryHours = entry.taskHours.reduce((s, h) => s + h.hours, 0)
      }
      studioTotal += entryHours

      for (const th of entry.taskHours) {
        memberHours[th.teamMemberId] = (memberHours[th.teamMemberId] ?? 0) + th.hours
      }

      if (entry.project) {
        if (!projectHours[entry.project.id]) {
          projectHours[entry.project.id] = { name: entry.project.name, hours: 0 }
        }
        projectHours[entry.project.id].hours += entryHours
      }
    }

    // Top 3 projects
    const top3 = Object.values(projectHours)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 3)

    const weekLabel = `${format(weekStart, 'dd MMM')} – ${format(weekEnd, 'dd MMM yyyy')}`

    const members = await prisma.teamMember.findMany({
      where: { isActive: true, whatsappNumber: { not: null } },
    })

    const results: string[] = []

    for (const member of members) {
      if (!member.whatsappNumber) continue
      const myHours = memberHours[member.id] ?? 0
      const top3Lines = top3.map(p => `• ${p.name} — ${p.hours.toFixed(1)}h`).join('\n')
      const msg = `📊 Last week's summary\n${weekLabel}\n\nStudio total: ${studioTotal.toFixed(1)}h\nYour hours: ${myHours.toFixed(1)}h\n\nTop projects:\n${top3Lines}`
      await sendWhatsAppMessage(member.whatsappNumber, msg)
      results.push(`Sent summary to ${member.name}`)
    }

    return NextResponse.json({ success: true, results })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
