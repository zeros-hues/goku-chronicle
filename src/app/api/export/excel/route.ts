import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingType } from '@prisma/client'
import { format } from 'date-fns'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get('startDate')
  const endDate     = searchParams.get('endDate')
  const clientId    = searchParams.get('clientId')
  const billingType = searchParams.get('billingType') as BillingType | null
  const anonymous   = searchParams.get('anonymous') === 'true'

  try {
    const where = {
      deletedAt: null as null,
      ...(startDate ? { date: { gte: new Date(startDate) } } : {}),
      ...(endDate   ? { date: { lte: new Date(endDate)   } } : {}),
      ...(clientId  ? { project: { clientId } } : {}),
    }

    const entries = await prisma.taskEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { include: { client: true } },
        taskHours: { include: { teamMember: true } },
      },
    })

    const filtered = billingType
      ? entries.filter(e => (e.billingOverride ?? e.project?.billingType) === billingType)
      : entries

    // Get unique active members (for named columns)
    const members = await prisma.teamMember.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Timesheet')

    const HEADER_FILL: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A2E' },
    }
    const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }

    if (!anonymous) {
      sheet.columns = [
        { header: 'Date',    key: 'date',    width: 14 },
        { header: 'Day',     key: 'day',     width: 8  },
        { header: 'Project', key: 'project', width: 22 },
        { header: 'Task',    key: 'task',    width: 50 },
        ...members.map(m => ({ header: m.initials, key: m.id, width: 8 })),
        { header: 'Total',   key: 'total',   width: 10 },
      ]
    } else {
      sheet.columns = [
        { header: 'Date',              key: 'date',      width: 14 },
        { header: 'Day',               key: 'day',       width: 8  },
        { header: 'Project',           key: 'project',   width: 22 },
        { header: 'Task',              key: 'task',      width: 50 },
        { header: 'No. of Resources', key: 'resources', width: 16 },
        { header: 'Working Hours',    key: 'workhours', width: 16 },
        { header: 'Total',            key: 'total',     width: 10 },
      ]
    }

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = HEADER_FONT
    headerRow.fill = HEADER_FILL
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 22

    // Group by date
    const grouped: Record<string, typeof filtered> = {}
    for (const e of filtered) {
      const key = format(e.date, 'yyyy-MM-dd')
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(e)
    }

    let grandTotal = 0
    const dateKeys = Object.keys(grouped).sort()

    for (const dateKey of dateKeys) {
      const dayEntries = grouped[dateKey]
      const d = new Date(dateKey + 'T00:00:00')
      const dateLabel = format(d, 'dd MMM yyyy')
      const dayLabel  = format(d, 'EEE')

      const startRow = sheet.rowCount + 1
      let dateTotal = 0

      for (const entry of dayEntries) {
        const projectName = entry.project ? `${entry.project.client.name} · ${entry.project.name}` : 'Internal'

        let entryTotal = 0
        if (!anonymous) {
          const row: Record<string, string | number> = {
            date: dateLabel,
            day: dayLabel,
            project: projectName,
            task: entry.taskDescription,
          }
          for (const m of members) {
            const th = entry.taskHours.find(h => h.teamMemberId === m.id)
            row[m.id] = th ? th.hours : ''
            if (th) entryTotal += th.hours
          }
          if (entry.isMeeting) {
            entryTotal = (entry.meetingDuration ?? 0)
            for (const m of members) row[m.id] = ''
          }
          row['total'] = entryTotal
          const addedRow = sheet.addRow(row)
          if (entry.isMeeting) addedRow.font = { italic: true }
        } else {
          let resources = ''
          let workHours = ''
          if (entry.isMeeting) {
            resources = String(entry.personCount ?? '')
            workHours = String(entry.meetingDuration ?? '')
            entryTotal = (entry.meetingDuration ?? 0)
          } else {
            const hrs = entry.taskHours.filter(h => h.hours > 0)
            resources = String(hrs.length)
            workHours = hrs.length === 1
              ? String(hrs[0].hours)
              : hrs.map(h => h.hours).join('+')
            entryTotal = hrs.reduce((s, h) => s + h.hours, 0)
          }
          const addedRow = sheet.addRow({
            date: dateLabel, day: dayLabel, project: projectName,
            task: entry.taskDescription, resources, workhours: workHours, total: entryTotal,
          })
          if (entry.isMeeting) addedRow.font = { italic: true }
        }
        dateTotal += entryTotal
      }

      // Merge date cell vertically across all rows for this date
      const endRow = sheet.rowCount
      if (endRow > startRow) {
        sheet.mergeCells(startRow, 1, endRow, 1)
        sheet.mergeCells(startRow, 2, endRow, 2)
      }

      // Date subtotal row
      const totalRow = sheet.addRow({
        date: '', day: '', project: '', task: `Total — ${dateLabel}`,
        ...(anonymous ? { resources: '', workhours: '' } : {}),
        total: dateTotal,
      })
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
      grandTotal += dateTotal
    }

    // Grand total row
    const grandRow = sheet.addRow({
      date: '', day: '', project: '', task: 'GRAND TOTAL',
      ...(anonymous ? { resources: '', workhours: '' } : {}),
      total: grandTotal,
    })
    grandRow.font = { bold: true, size: 12 }
    grandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
    grandRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `timesheet-${startDate ?? 'all'}-to-${endDate ?? 'all'}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate Excel export' }, { status: 500 })
  }
}
