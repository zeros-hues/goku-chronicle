import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format, eachDayOfInterval, parseISO } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  try {
    // Fetch user settings for overtime threshold
    const user = await prisma.user.findFirst()
    const overtimeThreshold = user?.overtimeThreshold ?? 8
    const userHolidays = user
      ? await prisma.holiday.findMany({ where: { userId: user.id } })
      : []

    const where = {
      deletedAt: null as null,
      ...(startDate ? { date: { gte: new Date(startDate) } } : {}),
      ...(endDate   ? { date: { lte: new Date(endDate)   } } : {}),
    }

    const entries = await prisma.taskEntry.findMany({
      where,
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    // Total hours
    let totalHours = 0
    let retainershipHours = 0
    let nonRetainershipHours = 0

    const projectHoursMap: Record<string, { projectId: string; projectName: string; clientName: string; hours: number }> = {}
    const memberHoursMap: Record<string, { memberId: string; memberName: string; initials: string; hours: number }> = {}
    const dailyMap: Record<string, { date: string; hours: number; byMember: Record<string, number> }> = {}

    for (const entry of entries) {
      const dateStr = format(entry.date, 'yyyy-MM-dd')
      const billing = entry.billingOverride ?? entry.project?.billingType ?? 'INTERNAL'

      let entryHours = 0
      if (entry.isMeeting) {
        entryHours = (entry.meetingDuration ?? 0)
      } else {
        entryHours = entry.taskHours.reduce((s, h) => s + h.hours, 0)
      }

      totalHours += entryHours
      if (billing === 'RETAINERSHIP') retainershipHours += entryHours
      else if (billing === 'OUT_OF_RETAINERSHIP') nonRetainershipHours += entryHours

      // Project hours
      if (entry.project) {
        if (!projectHoursMap[entry.project.id]) {
          projectHoursMap[entry.project.id] = {
            projectId: entry.project.id,
            projectName: entry.project.name,
            clientName: entry.project.client.name,
            hours: 0,
          }
        }
        projectHoursMap[entry.project.id].hours += entryHours
      }

      // Daily totals
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, hours: 0, byMember: {} }
      }
      dailyMap[dateStr].hours += entryHours

      // Member hours (task entries only)
      if (!entry.isMeeting) {
        for (const th of entry.taskHours) {
          const mid = th.teamMemberId
          if (!memberHoursMap[mid]) {
            memberHoursMap[mid] = {
              memberId: mid,
              memberName: th.teamMember.name,
              initials: th.teamMember.initials,
              hours: 0,
            }
          }
          memberHoursMap[mid].hours += th.hours
          if (!dailyMap[dateStr].byMember[mid]) dailyMap[dateStr].byMember[mid] = 0
          dailyMap[dateStr].byMember[mid] += th.hours
        }
      }
    }

    const internalHours = totalHours - retainershipHours - nonRetainershipHours

    // Overtime: days where member total > overtimeThreshold
    const memberOvertime: Record<string, { date: string; hours: number }[]> = {}
    for (const [date, dayData] of Object.entries(dailyMap)) {
      for (const [mid, hours] of Object.entries(dayData.byMember)) {
        if (hours > overtimeThreshold) {
          if (!memberOvertime[mid]) memberOvertime[mid] = []
          memberOvertime[mid].push({ date, hours })
        }
      }
    }

    const overtime = Object.entries(memberOvertime).map(([memberId, days]) => ({
      memberId,
      memberName: memberHoursMap[memberId]?.memberName ?? memberId,
      days,
    }))

    // Gap days (weekdays in range with no entries, excluding holidays)
    const holidaySet = new Set(userHolidays.map(h => format(h.date, 'yyyy-MM-dd')))
    let gapDays: string[] = []
    if (startDate && endDate) {
      const allDays = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
      gapDays = allDays
        .filter(d => {
          const dow = d.getDay()
          if (dow === 0 || dow === 6) return false
          const s = format(d, 'yyyy-MM-dd')
          return !dailyMap[s] && !holidaySet.has(s)
        })
        .map(d => format(d, 'yyyy-MM-dd'))
    }

    const dailyList = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
    const busiestDay = dailyList.reduce<{ date: string; hours: number } | null>((best, d) =>
      !best || d.hours > best.hours ? { date: d.date, hours: d.hours } : best, null)

    const avgDailyHours = dailyList.length > 0
      ? totalHours / dailyList.length
      : 0

    const activeMembers = new Set(entries.flatMap(e => e.taskHours.map(h => h.teamMemberId))).size

    return NextResponse.json({
      totalHours,
      retainershipHours,
      nonRetainershipHours,
      activeMembers,
      hoursByProject: Object.values(projectHoursMap).sort((a, b) => b.hours - a.hours),
      hoursByMember: Object.values(memberHoursMap).sort((a, b) => b.hours - a.hours),
      dailyHours: dailyList.map(d => ({
        date: d.date,
        hours: d.hours,
        byMember: Object.entries(d.byMember).map(([memberId, hours]) => ({ memberId, hours })),
      })),
      billingSplit: {
        retainership: retainershipHours,
        outOfRetainership: nonRetainershipHours,
        internal: internalHours,
      },
      overtime,
      gapDays,
      busiestDay,
      avgDailyHours,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
