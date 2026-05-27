import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { extractTimesheetFromImage } from '@/lib/ai-provider'

// In-memory state (resets on cold start — acceptable for MVP)
const pendingEntries: Record<string, { entries: PendingEntry[]; extractedDate: string | null }> = {}

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
    console.log('[WA] Incoming webhook body:', JSON.stringify(body, null, 2))

    const entry = (body as {
      entry?: { changes?: { value?: {
        messages?: { from: string; type: string; text?: { body: string }; image?: { id: string; mime_type: string } }[]
      } }[] }[]
    }).entry?.[0]

    const change  = entry?.changes?.[0]
    const value   = change?.value
    const message = value?.messages?.[0]
    if (!message) {
      console.log('[WA] No message found in payload — skipping')
      return
    }

    const from = message.from
    const type = message.type
    console.log(`[WA] Message received — from: ${from}, type: ${type}`)

    // Resolve team member — fetch all active members and compare in JS to handle
    // +91/91/no-prefix variants stored inconsistently in the database
    const normalise = (n: string) => n.replace(/\D/g, '').slice(-10)
    const senderLast10 = normalise(from)

    console.log('[WA] Looking for last10:', senderLast10)

    const allMembers = await prisma.teamMember.findMany({ where: { isActive: true } })

    console.log('[WA] All members with numbers:', allMembers.map(m => ({
      name: m.name,
      stored: m.whatsappNumber,
      normalised: m.whatsappNumber ? normalise(m.whatsappNumber) : null,
    })))

    const member = allMembers.find(m =>
      m.whatsappNumber !== null &&
      normalise(m.whatsappNumber) === senderLast10
    )

    console.log('[WA] Member found:', member?.name ?? 'NOT FOUND')

    if (!member) {
      console.log(`[WA] Rejecting unknown number ${from}`)
      await sendWhatsAppMessage(from, 'This is a private assistant. Contact your administrator to get access.')
      return
    }

    if (type === 'image' && message.image) {
      console.log(`[WA] Branch: IMAGE — imageId: ${message.image.id}, mimeType: ${message.image.mime_type}`)
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
      console.log(`[WA] Image downloaded — base64 length: ${base64.length} chars`)

      console.log('[WA] Calling extractTimesheetFromImage (Gemini)...')
      const extracted = await extractTimesheetFromImage(base64, mimeType)
      console.log('[WA] Gemini extraction result:', JSON.stringify(extracted, null, 2))

      // Load all known projects for matching
      const allProjects = await prisma.project.findMany({ include: { client: true } })
      console.log(`[WA] Loaded ${allProjects.length} projects for matching`)

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

      console.log(`[WA] Mapped ${pending.length} pending entries (unknown projects: ${pending.filter(e => e.unknownProject).length})`)
      pendingEntries[from] = { entries: pending, extractedDate: extracted.date }

      const confirmMsg = buildConfirmationMessage(pending, extracted.date)
      console.log(`[WA] Sending confirmation message to ${from}:`, confirmMsg)
      const confirmResp = await sendWhatsAppMessage(from, confirmMsg)
      console.log(`[WA] sendWhatsAppMessage response:`, confirmResp)
      return
    }

    if (type === 'text') {
      const text = (message.text?.body ?? '').trim()
      const upper = text.toUpperCase()
      console.log(`[WA] Branch: TEXT — raw: "${text}", upper: "${upper}"`)

      if (upper === 'YES') {
        console.log(`[WA] Command: YES — looking up pending entries for ${from}`)
        const pending = pendingEntries[from]
        if (!pending) {
          console.log(`[WA] No pending entries for ${from}`)
          await sendWhatsAppMessage(from, 'No pending entries. Send a timesheet photo first.')
          return
        }
        const { entries, extractedDate } = pending
        console.log(`[WA] Found ${entries.length} pending entries, date: ${extractedDate}`)
        const allMembers = await prisma.teamMember.findMany()
        let saved = 0

        for (const e of entries) {
          if (e.unknownProject) {
            console.log(`[WA] Skipping row ${e.rowNumber} — unknown project "${e.projectCategory}"`)
            continue
          }
          const matchedMember = allMembers.find(m =>
            m.name.toLowerCase().includes((e.designer ?? '').toLowerCase()) ||
            (e.designer ?? '').toLowerCase().includes(m.name.toLowerCase())
          )
          console.log(`[WA] Row ${e.rowNumber} — designer: "${e.designer}", matched member: ${matchedMember?.name ?? 'none'}`)
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
        console.log(`[WA] Saved ${saved} entries to DB`)
        delete pendingEntries[from]
        const saveMsg = `✅ Saved! ${saved} tasks logged for ${extractedDate ?? 'today'}.`
        console.log(`[WA] Sending save confirmation to ${from}:`, saveMsg)
        const saveResp = await sendWhatsAppMessage(from, saveMsg)
        console.log(`[WA] sendWhatsAppMessage response:`, saveResp)
        return
      }

      if (upper === 'NO') {
        console.log(`[WA] Command: NO — clearing pending entries for ${from}`)
        delete pendingEntries[from]
        const cancelMsg = 'Cancelled. Nothing was saved.'
        console.log(`[WA] Sending cancel confirmation to ${from}`)
        const cancelResp = await sendWhatsAppMessage(from, cancelMsg)
        console.log(`[WA] sendWhatsAppMessage response:`, cancelResp)
        return
      }

      if (upper.startsWith('EDIT')) {
        console.log(`[WA] Command: EDIT — raw: "${text}"`)
        const parts   = text.split(' ')
        const rowNum  = parseInt(parts[1])
        const field   = parts[2]?.toLowerCase()
        const value   = parts.slice(3).join(' ')
        console.log(`[WA] EDIT parsed — row: ${rowNum}, field: "${field}", value: "${value}"`)
        const pending = pendingEntries[from]
        if (pending && !isNaN(rowNum) && field && value) {
          const row = pending.entries.find(e => e.rowNumber === rowNum)
          if (row) {
            if (field === 'hours')   row.hours = parseFloat(value)
            if (field === 'project') row.projectCategory = value
            if (field === 'task')    row.taskDescription = value
            console.log(`[WA] Applied EDIT to row ${rowNum}:`, row)
            const editMsg = buildConfirmationMessage(pending.entries, pending.extractedDate)
            const editResp = await sendWhatsAppMessage(from, editMsg)
            console.log(`[WA] sendWhatsAppMessage response:`, editResp)
          } else {
            console.log(`[WA] EDIT — row ${rowNum} not found in pending entries`)
          }
        } else {
          console.log(`[WA] EDIT — invalid args or no pending entries (pending: ${!!pending}, rowNum: ${rowNum}, field: "${field}", value: "${value}")`)
        }
        return
      }

      if (upper === 'CREATE') {
        console.log(`[WA] Command: CREATE — looking for unknown project row`)
        const pending = pendingEntries[from]
        if (pending) {
          const unknownRow = pending.entries.find(e => e.unknownProject)
          if (unknownRow) {
            console.log(`[WA] Creating new project: "${unknownRow.projectCategory}"`)
            const newProj = await prisma.project.create({
              data: { name: unknownRow.projectCategory!, clientId: (await prisma.client.findFirst())!.id, billingType: 'INTERNAL' },
            })
            console.log(`[WA] Project created — id: ${newProj.id}, name: "${newProj.name}"`)
            unknownRow.projectId = newProj.id
            unknownRow.unknownProject = false
            const createMsg = buildConfirmationMessage(pending.entries, pending.extractedDate)
            const createResp = await sendWhatsAppMessage(from, createMsg)
            console.log(`[WA] sendWhatsAppMessage response:`, createResp)
          } else {
            console.log(`[WA] CREATE — no unknown project row found`)
          }
        } else {
          console.log(`[WA] CREATE — no pending entries for ${from}`)
        }
        return
      }

      if (upper === 'SKIP') {
        console.log(`[WA] Command: SKIP — clearing unknown project flag`)
        const pending = pendingEntries[from]
        if (pending) {
          const unknownRow = pending.entries.find(e => e.unknownProject)
          if (unknownRow) {
            console.log(`[WA] Skipping unknown project row ${unknownRow.rowNumber}: "${unknownRow.projectCategory}"`)
            unknownRow.projectId = null
            unknownRow.unknownProject = false
          }
          const skipMsg = buildConfirmationMessage(pending.entries, pending.extractedDate)
          const skipResp = await sendWhatsAppMessage(from, skipMsg)
          console.log(`[WA] sendWhatsAppMessage response:`, skipResp)
        } else {
          console.log(`[WA] SKIP — no pending entries for ${from}`)
        }
        return
      }

      // Unknown command when pending entries exist — check if it's a project name update
      console.log(`[WA] Unknown command — checking if "${text}" matches a project name`)
      const pending = pendingEntries[from]
      if (pending) {
        const unknownRow = pending.entries.find(e => e.unknownProject)
        if (unknownRow) {
          const allProjects = await prisma.project.findMany()
          const match = allProjects.find(p => p.name.toLowerCase() === text.toLowerCase())
          console.log(`[WA] Project name match for "${text}":`, match ? `found — "${match.name}" (id: ${match.id})` : 'not found')
          if (match) {
            unknownRow.projectId = match.id
            unknownRow.unknownProject = false
            const matchMsg = buildConfirmationMessage(pending.entries, pending.extractedDate)
            const matchResp = await sendWhatsAppMessage(from, matchMsg)
            console.log(`[WA] sendWhatsAppMessage response:`, matchResp)
            return
          }
        }
        const helpMsg = "Reply YES to save, NO to cancel, or EDIT [row] [field] [value] to correct an entry."
        console.log(`[WA] Sending help prompt to ${from}`)
        const helpResp = await sendWhatsAppMessage(from, helpMsg)
        console.log(`[WA] sendWhatsAppMessage response:`, helpResp)
      } else {
        console.log(`[WA] No pending entries for ${from} — ignoring unknown command`)
      }
    } else {
      console.log(`[WA] Branch: UNKNOWN type "${type}" — no handler, ignoring`)
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
