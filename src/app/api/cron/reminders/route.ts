import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { format } from 'date-fns'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now         = new Date()
    const currentHour = `${String(now.getHours()).padStart(2, '0')}:00`
    const today       = format(now, 'yyyy-MM-dd')

    const users = await prisma.user.findMany({
      where: { reminderEnabled: true },
    })

    const results: string[] = []

    for (const user of users) {
      // Check if current hour matches reminder time
      const reminderHour = user.reminderTime.slice(0, 5)
      if (reminderHour !== currentHour) continue

      // Find team members with WhatsApp numbers
      const members = await prisma.teamMember.findMany({
        where: { whatsappNumber: { not: null }, isActive: true },
      })

      for (const member of members) {
        if (!member.whatsappNumber) continue

        // Check if they logged anything today
        const todayEntries = await prisma.taskHour.findFirst({
          where: {
            teamMemberId: member.id,
            taskEntry: {
              deletedAt: null,
              date: new Date(today),
            },
          },
        })

        if (!todayEntries) {
          await sendWhatsAppMessage(
            member.whatsappNumber,
            `👋 Hey ${member.name}! You haven't logged any tasks today. Don't forget to record your work!`
          )
          results.push(`Reminded ${member.name}`)
        }
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
