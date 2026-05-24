import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { extractTimesheetFromImage } from '@/lib/ai-provider'

// In-memory state (resets on cold start — acceptable for MVP)
const pendingEntries: Record<string, { entries: PendingEntry[]; extractedDate: string | null }> = {}
const pendingRegistration: Record<string, boolean> = {}

interface PendingEntry {
  rowNumber: number
  taskDescription: string
  projectCategory: string | null
  projectId: string | null
  designer: string | null
  hours: number
  isMeeting: boolean
  isInternal: boolean
  personCount: number | null
  unknownProject: boolean
}

/* ── Webhook verification (GET) ─────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

/* ── Incoming messages (POST) ───────────────────────────── */
export async function POST(req: NextRequest) {
  // Return 200 immediately — Meta requires it
  const body = await req.json()

  // Process asynchronously
  processMessage(body).catch(e => console.error('WhatsApp processing error:', e))

  return new NextResponse('OK', { status: 200 })
}

async function processMessage(body: Record<string, unknown>) {
  try {
    const entry = (body as {
      entry?: { changes?: { value?: {
        messages?: { from: string; type: string; text?: { body: string }; image?: { id: string; mime_type: string } }[]
      } }[] }[]
    }).entry?.[0]

    const change  = entry?.changes?.[0]
    const value   = change?.value
    const message = value?.messages?.[0]
    if (!message) return

    const from = message.from
    const type = message.type

    // Resolve team member
    const member = await prisma.teamMember.findFirst({ where: { whatsappNumber: from } })

    if (!member) {
      if (pendingRegistration[from]) {
        // They're replying with their name
        const name = (message.text?.body ?? '').trim()
        if (name) {
          await prisma.teamMember.create({
            data: { name, initials: name.slice(0, 2).toUpperCase() },
          })
          delete pendingRegistration[from]
          await sendWhatsAppMessage(from, `✅ Welcome, ${name}! You're now registered. Send a photo of your timesheet to log hours.`)
        }
      } else {
        pendingRegistration[from] = true
        await sendWhatsAppMessage(from, "Hi! I don't recognise this number. What's your name?")
      }
      return
    }

    if (type === 'image' && message.image) {
      await sendWhatsAppMessage(from, 'Got it, reading your timesheet...')

      // Download image from Meta
      const imageId   = message.image.id
      const mimeType  = message.image.mime_type
      const mediaUrl  = `https://graph.facebook.com/v18.0/${imageId}`
      const tokenResp = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      })
      const mediaData = await tokenResp.json() as { url: string }
      const imgResp   = await fetch(mediaData.url, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      })
      const imgBuffer = await imgResp.arrayBuffer()
      const base64    = Buffer.from(imgBuffer).toString('base64')

      const extracted = await extractTimesheetFromImage(base64, mimeType)

      // Load all known projects for matching
      const allProjects = await prisma.project.findMany({ include: { client: true } })

      const pending: PendingEntry[] = extracted.entries.map(e => {
        const proj = allProjects.find(p =>
          p.name.toLowerCase() === (e.projectCategory ?? '').toLowerCase()
        )
        return {
          ...e,
          projectId: proj?.id ?? null,
          unknownProject: !proj && !!e.projectCategory && !e.isInternal,
        }
      })

      pendingEntries[from] = { entries: pending, extractedDate: extracted.date }
      await sendWhatsAppMessage(from, buildConfirmationMessage(pending, extracted.date))
      return
    }

    if (type === 'text') {
      const text = (message.text?.body ?? '').trim()
      const upper = text.toUpperCase()

      if (upper === 'YES') {
        const pending = pendingEntries[from]
        if (!pending) {
          await sendWhatsAppMessage(from, 'No pending entries. Send a timesheet photo first.')
          return
        }
        const { entries, extractedDate } = pending
        const allMembers = await prisma.teamMember.findMany()
        let saved = 0

        for (const e of entries) {
          if (e.unknownProject) continue
          const matchedMember = allMembers.find(m =>
            m.name.toLowerCase().includes((e.designer ?? '').toLowerCase()) ||
            (e.designer ?? '').toLowerCase().includes(m.name.toLowerCase())
          )
          await prisma.taskEntry.create({
            data: {
              date: new Date(extractedDate ?? new Date()),
              projectId: e.projectId,
              taskDescription: e.taskDescription,
              isMeeting: e.isMeeting,
              personCount: e.personCount,
              source: 'WHATSAPP_BOT',
              submittedByPhone: from,
              taskHours: matchedMember && !e.isMeeting
                ? { create: { teamMemberId: matchedMember.id, hours: e.hours } }
                : undefined,
            },
          })
          saved++
        }
        delete pendingEntries[from]
        await sendWhatsAppMessage(from, `✅ Saved! ${saved} tasks logged for ${extractedDate ?? 'today'}.`)
        return
      }

      if (upper === 'NO') {
        delete pendingEntries[from]
        await sendWhatsAppMessage(from, 'Cancelled. Nothing was saved.')
        return
      }

      if (upper.startsWith('EDIT')) {
        const parts   = text.split(' ')
        const rowNum  = parseInt(parts[1])
        const field   = parts[2]?.toLowerCase()
        const value   = parts.slice(3).join(' ')
        const pending = pendingEntries[from]
        if (pending && !isNaN(rowNum) && field && value) {
          const row = pending.entries.find(e => e.rowNumber === rowNum)
          if (row) {
            if (field === 'hours')   row.hours = parseFloat(value)
            if (field === 'project') row.projectCategory = value
            if (field === 'task')    row.taskDescription = value
            await sendWhatsAppMessage(from, buildConfirmationMessage(pending.entries, pending.extractedDate))
          }
        }
        return
      }

      if (upper === 'CREATE') {
        const pending = pendingEntries[from]
        if (pending) {
          const unknownRow = pending.entries.find(e => e.unknownProject)
          if (unknownRow) {
            const newProj = await prisma.project.create({
              data: { name: unknownRow.projectCategory!, clientId: (await prisma.client.findFirst())!.id, billingType: 'INTERNAL' },
            })
            unknownRow.projectId = newProj.id
            unknownRow.unknownProject = false
            await sendWhatsAppMessage(from, buildConfirmationMessage(pending.entries, pending.extractedDate))
          }
        }
        return
      }

      if (upper === 'SKIP') {
        const pending = pendingEntries[from]
        if (pending) {
          const unknownRow = pending.entries.find(e => e.unknownProject)
          if (unknownRow) {
            unknownRow.projectId = null
            unknownRow.unknownProject = false
          }
          await sendWhatsAppMessage(from, buildConfirmationMessage(pending.entries, pending.extractedDate))
        }
        return
      }

      // Unknown command when pending entries exist — check if it's a project name update
      const pending = pendingEntries[from]
      if (pending) {
        const unknownRow = pending.entries.find(e => e.unknownProject)
        if (unknownRow) {
          const allProjects = await prisma.project.findMany()
          const match = allProjects.find(p => p.name.toLowerCase() === text.toLowerCase())
          if (match) {
            unknownRow.projectId = match.id
            unknownRow.unknownProject = false
            await sendWhatsAppMessage(from, buildConfirmationMessage(pending.entries, pending.extractedDate))
            return
          }
        }
        await sendWhatsAppMessage(from, "Reply YES to save, NO to cancel, or EDIT [row] [field] [value] to correct an entry.")
      }
    }
  } catch (e) {
    console.error('WhatsApp message processing failed:', e)
  }
}

function buildConfirmationMessage(entries: PendingEntry[], date: string | null): string {
  let msg = `📋 Timesheet for ${date ?? 'unknown date'}\n\n`
  for (const e of entries) {
    if (e.isMeeting) {
      msg += `${e.rowNumber}. Meeting | ${e.personCount ?? '?'} persons | ${e.hours}h\n`
    } else if (e.isInternal) {
      msg += `${e.rowNumber}. Internal | ${e.designer ?? '?'}: ${e.hours}h\n`
    } else if (e.unknownProject) {
      msg += `${e.rowNumber}. ⚠️ Project "${e.projectCategory}" not found — ${e.designer ?? '?'}: ${e.hours}h\n`
    } else {
      msg += `${e.rowNumber}. ${e.projectCategory} | ${e.designer ?? '?'}: ${e.hours}h — ${e.taskDescription}\n`
    }
  }
  msg += '\nReply:\n✅ YES to save\n✏️ EDIT [row] [field] [value]\n❌ NO to cancel'
  if (entries.some(e => e.unknownProject)) {
    msg += '\nCREATE to create missing project\nSKIP to mark as internal'
  }
  return msg
}
