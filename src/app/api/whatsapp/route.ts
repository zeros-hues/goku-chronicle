import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { extractTimesheetFromImage } from '@/lib/ai-provider'

/* ── Types ──────────────────────────────────────────────────── */

interface PendingEntry {
  rowNumber:          number
  taskDescription:    string
  projectCategory:    string | null  // raw name from AI
  projectId:          string | null  // resolved DB id
  projectName:        string | null  // resolved display name
  fuzzyMatchOriginal: string | null  // AI name when fuzzy-matched
  designer:           string | null  // raw designer name from AI
  memberId:           string | null  // resolved TeamMember.id
  hours:              number         // task hours OR meeting duration
  isMeeting:          boolean
  isInternal:         boolean
  personCount:        number | null
  unknownProject:     boolean
}

interface PendingData {
  extractedDate: string | null
  entries:       PendingEntry[]
}

interface EditCommand {
  row:   number  // -1 = date-level edit
  field: string
  value: string
}

/* ── Constants ──────────────────────────────────────────────── */

const MONTH_MAP: Record<string, number> = {
  january:1,  february:2,  march:3,     april:4,    may:5,      june:6,
  july:7,     august:8,    september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
}
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/* ── Phone normalisation ────────────────────────────────────── */

function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/* ── Fuzzy project matching ─────────────────────────────────── */

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

type ProjectRow = { id: string; name: string; billingType: string }

function findClosestProject(
  name: string,
  projects: ProjectRow[],
): { project: ProjectRow; fuzzy: boolean } | null {
  const lower = name.toLowerCase()
  const exact = projects.find(p => p.name.toLowerCase() === lower)
  if (exact) return { project: exact, fuzzy: false }
  const best = projects
    .map(p => ({ p, d: levenshtein(lower, p.name.toLowerCase()) }))
    .filter(x => x.d <= 2)
    .sort((a, b) => a.d - b.d)[0]
  return best ? { project: best.p, fuzzy: true } : null
}

/* ── Pending state — DB ─────────────────────────────────────── */

async function savePendingDB(phone: string, data: PendingData): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  await prisma.pendingExtraction.upsert({
    where:  { senderPhone: phone },
    update: { extractedData: data as object, expiresAt },
    create: { senderPhone: phone, extractedData: data as object, expiresAt },
  })
}

async function loadPendingDB(phone: string): Promise<PendingData | null> {
  const row = await prisma.pendingExtraction.findUnique({ where: { senderPhone: phone } })
  if (!row) return null
  if (new Date() > row.expiresAt) {
    await prisma.pendingExtraction.delete({ where: { senderPhone: phone } })
    return null
  }
  return row.extractedData as unknown as PendingData
}

async function clearPendingDB(phone: string): Promise<void> {
  await prisma.pendingExtraction.deleteMany({ where: { senderPhone: phone } })
}

/* ── Duplicate detection ────────────────────────────────────── */

async function checkDuplicate(
  date: Date,
  projectId: string | null,
  taskDescription: string,
): Promise<boolean> {
  const existing = await prisma.taskEntry.findFirst({
    where: { date, projectId: projectId ?? null, taskDescription, deletedAt: null },
  })
  return !!existing
}

/* ── Date helpers ───────────────────────────────────────────── */

function parseFlexibleDate(value: string): string | null {
  const v = value.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  // DD/MM/YYYY
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // "May 27" or "27 May"
  const mFirst = v.match(/^([A-Za-z]+)\s+(\d{1,2})$/)
  if (mFirst) {
    const n = MONTH_MAP[mFirst[1].toLowerCase()]
    if (n) return `${new Date().getFullYear()}-${String(n).padStart(2,'0')}-${mFirst[2].padStart(2,'0')}`
  }
  const dFirst = v.match(/^(\d{1,2})\s+([A-Za-z]+)$/)
  if (dFirst) {
    const n = MONTH_MAP[dFirst[2].toLowerCase()]
    if (n) return `${new Date().getFullYear()}-${String(n).padStart(2,'0')}-${dFirst[1].padStart(2,'0')}`
  }
  return null
}

function formatConfirmationDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date'
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} (${DAY_NAMES[d.getDay()]})`
}

/* ── EDIT command parser ────────────────────────────────────── */

function parseEditCommand(text: string): EditCommand | null {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  // "EDIT date 2026-05-27"
  const dateMatch = cleaned.match(/^EDIT\s+date\s+(.+)$/i)
  if (dateMatch) return { row: -1, field: 'date', value: dateMatch[1].trim() }
  // "EDIT 2 hours 8" / "EDIT 2 project Perimeter" / "EDIT 2 persons 3"
  const rowMatch = cleaned.match(/^EDIT\s+(\d+)\s+(\w+)\s+(.+)$/i)
  if (!rowMatch) return null
  return {
    row:   parseInt(rowMatch[1]),
    field: rowMatch[2].toLowerCase(),
    value: rowMatch[3].replace(/h$/i, '').trim(),
  }
}

/* ── Confirmation message ───────────────────────────────────── */

function buildConfirmationMessage(entries: PendingEntry[], date: string | null): string {
  const dateDisplay = formatConfirmationDate(date)
  const warnings: string[] = []
  const memberTotals: Record<string, number> = {}
  let totalHours = 0

  let msg = `📋 Timesheet for ${dateDisplay}\n\n`

  for (const e of entries) {
    if (e.isMeeting) {
      const personStr = e.personCount == null
        ? '2 persons (assumed)'
        : `${e.personCount} persons`
      if (e.personCount == null)
        warnings.push(`⚠️ Row ${e.rowNumber}: person count assumed as 2 — use EDIT ${e.rowNumber} persons X to correct`)
      msg += `${e.rowNumber}. Meeting | ${personStr} | ${e.hours}h\n   [No project]\n\n`
      totalHours += e.hours * (e.personCount ?? 2)
    } else if (e.unknownProject) {
      msg += `${e.rowNumber}. ⚠️ "${e.projectCategory}" not found — ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No task description]'}\n`
      msg += `   Reply EDIT ${e.rowNumber} project [correct name] or CREATE / SKIP\n\n`
      totalHours += e.hours
    } else if (e.fuzzyMatchOriginal) {
      msg += `${e.rowNumber}. ⚠️ "${e.fuzzyMatchOriginal}" → ${e.projectName} | ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No task description]'}\n`
      msg += `   Did you mean "${e.projectName}"? EDIT ${e.rowNumber} project [name] to correct\n\n`
      totalHours += e.hours
      if (e.designer) memberTotals[e.designer] = (memberTotals[e.designer] ?? 0) + e.hours
    } else {
      const projLabel = e.isInternal
        ? (e.projectName ? `Internal · ${e.projectName}` : 'Internal')
        : (e.projectName ?? e.projectCategory ?? 'Unknown')
      msg += `${e.rowNumber}. ${projLabel} | ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No task description]'}\n\n`
      totalHours += e.hours
      if (e.designer) memberTotals[e.designer] = (memberTotals[e.designer] ?? 0) + e.hours
    }
  }

  msg += `Total: ${totalHours}h across ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}\n`

  for (const [name, total] of Object.entries(memberTotals)) {
    if (total > 12) warnings.push(`⚠️ ${name}'s total is ${total}h — please verify`)
  }
  if (warnings.length) msg += '\n' + warnings.join('\n') + '\n'

  msg += '\nReply:\n✅ YES — save all entries\n'
  msg += '✏️ EDIT [row] [field] [value]\n'
  msg += '   Examples: EDIT 4 persons 3 | EDIT 1 project Perimeter | EDIT date 2026-05-27\n'
  msg += '❌ NO — cancel'
  if (entries.some(e => e.unknownProject))
    msg += '\n\nCREATE — create missing project\nSKIP — mark as internal'

  return msg
}

async function sendConfirmation(phone: string, data: PendingData): Promise<unknown> {
  return sendWhatsAppMessage(phone, buildConfirmationMessage(data.entries, data.extractedDate))
}

/* ── Webhook verification (GET) ─────────────────────────────── */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN)
    return new NextResponse(challenge, { status: 200 })
  return new NextResponse('Forbidden', { status: 403 })
}

/* ── Incoming messages (POST) ───────────────────────────────── */

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    await processMessage(body)
  } catch (err) {
    console.error('[WA] Processing error:', err)
  }
  return NextResponse.json({ status: 'ok' })
}

/* ── Main processor ─────────────────────────────────────────── */

async function processMessage(body: Record<string, unknown>) {
  try {
    console.log('[WA] Incoming webhook body:', JSON.stringify(body, null, 2))

    const entry = (body as {
      entry?: { changes?: { value?: {
        messages?: { from: string; type: string; text?: { body: string }; image?: { id: string; mime_type: string } }[]
      } }[] }[]
    }).entry?.[0]

    const message = entry?.changes?.[0]?.value?.messages?.[0]
    if (!message) {
      console.log('[WA] No message in payload — skipping')
      return
    }

    const from = message.from
    const type = message.type
    console.log(`[WA] Message received — from: ${from}, type: ${type}`)

    /* ── Member lookup ────────────────────────────────────── */
    const senderLast10 = normalisePhone(from)
    console.log('[WA] Looking for last10:', senderLast10)

    const allActiveMembers = await prisma.teamMember.findMany({ where: { isActive: true } })
    console.log('[WA] All members with numbers:', allActiveMembers.map(m => ({
      name: m.name, stored: m.whatsappNumber,
      normalised: m.whatsappNumber ? normalisePhone(m.whatsappNumber) : null,
    })))

    const member = allActiveMembers.find(m =>
      m.whatsappNumber !== null && normalisePhone(m.whatsappNumber) === senderLast10
    )
    console.log('[WA] Member found:', member?.name ?? 'NOT FOUND')

    if (!member) {
      console.log(`[WA] Rejecting unknown number ${from}`)
      await sendWhatsAppMessage(from,
        "👋 Hi! This is Chrono, Chronicle's private timesheet assistant for Goku Studio.\n\n" +
        "Your number isn't registered. Please ask your administrator to add your WhatsApp number in Chronicle → Settings → Team Members."
      )
      return
    }

    /* ── IMAGE ────────────────────────────────────────────── */
    if (type === 'image' && message.image) {
      console.log(`[WA] Branch: IMAGE — imageId: ${message.image.id}, mimeType: ${message.image.mime_type}`)

      const existingPending = await loadPendingDB(from)
      if (existingPending) {
        console.log(`[WA] Replacing existing pending extraction for ${from}`)
        await sendWhatsAppMessage(from, "Got it — replacing your previous timesheet with this new one... 📋")
      } else {
        await sendWhatsAppMessage(from, "Got it, reading your timesheet... 📋")
      }

      // Download image from Meta
      const imageId  = message.image.id
      const mimeType = message.image.mime_type
      const tokenResp = await fetch(`https://graph.facebook.com/v18.0/${imageId}`, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      })
      const mediaData = await tokenResp.json() as { url: string }
      const imgResp   = await fetch(mediaData.url, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      })
      const base64 = Buffer.from(await imgResp.arrayBuffer()).toString('base64')
      console.log(`[WA] Image downloaded — base64 length: ${base64.length} chars`)

      // Extract via AI
      let extracted
      try {
        console.log('[WA] Calling extractTimesheetFromImage...')
        extracted = await extractTimesheetFromImage(base64, mimeType)
        console.log('[WA] Extraction result:', JSON.stringify(extracted, null, 2))
        if (!extracted?.entries?.length) throw new Error('No entries extracted')
      } catch (err) {
        console.error('[WA] Extraction failed:', err)
        await sendWhatsAppMessage(from,
          "I couldn't read your timesheet clearly 📷\n\n" +
          "Please try again with:\n" +
          "• Better lighting\n" +
          "• Camera held straight above the sheet\n" +
          "• Make sure all columns are visible"
        )
        return
      }

      // Resolve projects and designers
      const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
      console.log(`[WA] Loaded ${allProjects.length} active projects for matching`)

      const entries: PendingEntry[] = extracted.entries.map(e => {
        let projectId:          string | null = null
        let projectName:        string | null = null
        let unknownProject                    = false
        let fuzzyMatchOriginal: string | null = null

        if (e.projectCategory && !e.isInternal) {
          const match = findClosestProject(e.projectCategory, allProjects)
          if (match) {
            projectId   = match.project.id
            projectName = match.project.name
            if (match.fuzzy) fuzzyMatchOriginal = e.projectCategory
          } else {
            unknownProject = true
          }
        } else if (e.isInternal) {
          const internalProj = allProjects.find(p => p.billingType === 'INTERNAL')
          if (internalProj) { projectId = internalProj.id; projectName = internalProj.name }
        }

        const designerLower = (e.designer ?? '').toLowerCase()
        const matchedMember = designerLower
          ? allActiveMembers.find(m =>
              m.name.toLowerCase().includes(designerLower) ||
              designerLower.includes(m.name.toLowerCase())
            )
          : undefined

        return {
          rowNumber:         e.rowNumber,
          taskDescription:   e.taskDescription,
          projectCategory:   e.projectCategory,
          projectId,
          projectName,
          fuzzyMatchOriginal,
          designer:          e.designer,
          memberId:          matchedMember?.id ?? null,
          hours:             e.hours,
          isMeeting:         e.isMeeting,
          isInternal:        e.isInternal,
          personCount:       e.personCount ?? null,
          unknownProject,
        }
      })

      console.log(`[WA] Mapped ${entries.length} entries — unknown: ${entries.filter(e => e.unknownProject).length}, fuzzy: ${entries.filter(e => e.fuzzyMatchOriginal).length}`)

      const pendingData: PendingData = { extractedDate: extracted.date, entries }
      await savePendingDB(from, pendingData)
      console.log(`[WA] Pending saved to DB for ${from}`)

      const resp = await sendConfirmation(from, pendingData)
      console.log('[WA] Confirmation sent:', resp)
      return
    }

    /* ── TEXT ─────────────────────────────────────────────── */
    if (type === 'text') {
      const text  = (message.text?.body ?? '').trim()
      const upper = text.toUpperCase()
      console.log(`[WA] Branch: TEXT — raw: "${text}", upper: "${upper}"`)

      /* YES */
      if (upper === 'YES') {
        console.log(`[WA] Command: YES`)
        const pending = await loadPendingDB(from)
        if (!pending) {
          await sendWhatsAppMessage(from,
            "Your session has expired ⏰\n\nPlease send your timesheet photo again to start a new extraction."
          )
          return
        }

        const entryDate = pending.extractedDate
          ? new Date(pending.extractedDate + 'T12:00:00')
          : new Date()

        let savedCount = 0, skippedCount = 0
        const skippedTasks: string[] = []
        const savedProjectNames: string[] = []

        for (const e of pending.entries) {
          if (e.unknownProject) {
            console.log(`[WA] Skipping row ${e.rowNumber} — unresolved project "${e.projectCategory}"`)
            continue
          }

          const isDup = await checkDuplicate(entryDate, e.projectId, e.taskDescription)
          if (isDup) {
            console.log(`[WA] Duplicate — skipping row ${e.rowNumber}: "${e.taskDescription}"`)
            skippedCount++
            skippedTasks.push(e.taskDescription || `Row ${e.rowNumber}`)
            continue
          }

          if (e.isMeeting) {
            await prisma.taskEntry.create({
              data: {
                date:             entryDate,
                projectId:        e.projectId ?? null,
                taskDescription:  e.taskDescription || 'Meeting',
                isMeeting:        true,
                personCount:      e.personCount ?? 2,
                meetingDuration:  e.hours,
                source:           'WHATSAPP_BOT',
                submittedByPhone: from,
              },
            })
          } else {
            await prisma.taskEntry.create({
              data: {
                date:             entryDate,
                projectId:        e.projectId,
                taskDescription:  e.taskDescription,
                isMeeting:        false,
                source:           'WHATSAPP_BOT',
                submittedByPhone: from,
                taskHours: e.memberId
                  ? { create: { teamMemberId: e.memberId, hours: e.hours } }
                  : undefined,
              },
            })
          }

          savedCount++
          if (e.projectName) savedProjectNames.push(e.projectName)
          console.log(`[WA] Saved row ${e.rowNumber} (meeting: ${e.isMeeting})`)
        }

        await prisma.activityLog.create({
          data: {
            action:    'whatsapp.extracted',
            actorName: member.name,
            detail: {
              date:         pending.extractedDate,
              savedCount,
              skippedCount,
              submittedBy:  member.name,
              projects:     Array.from(new Set(savedProjectNames)),
            },
          },
        })

        await clearPendingDB(from)
        console.log(`[WA] Cleared pending for ${from}. Saved: ${savedCount}, skipped: ${skippedCount}`)

        const dateLabel = pending.extractedDate ? formatConfirmationDate(pending.extractedDate) : 'today'
        let reply = `✅ Saved ${savedCount} ${savedCount === 1 ? 'entry' : 'entries'} for ${dateLabel}.`
        if (skippedCount > 0) {
          reply += `\n⚠️ ${skippedCount} ${skippedCount === 1 ? 'entry was' : 'entries were'} already logged and skipped:`
          skippedTasks.forEach(t => { reply += `\n  • ${t}` })
        }

        const saveResp = await sendWhatsAppMessage(from, reply)
        console.log('[WA] Save reply sent:', saveResp)
        return
      }

      /* NO */
      if (upper === 'NO') {
        console.log(`[WA] Command: NO`)
        const pending = await loadPendingDB(from)
        if (!pending) {
          await sendWhatsAppMessage(from,
            "Your session has expired ⏰\n\nPlease send your timesheet photo again to start a new extraction."
          )
          return
        }
        await clearPendingDB(from)
        const resp = await sendWhatsAppMessage(from, 'Cancelled. Nothing was saved.')
        console.log('[WA] Cancel sent:', resp)
        return
      }

      /* EDIT */
      if (upper.startsWith('EDIT')) {
        console.log(`[WA] Command: EDIT — raw: "${text}"`)
        const pending = await loadPendingDB(from)
        if (!pending) {
          await sendWhatsAppMessage(from,
            "Your session has expired ⏰\n\nPlease send your timesheet photo again."
          )
          return
        }

        const cmd = parseEditCommand(text)
        if (!cmd) {
          await sendWhatsAppMessage(from,
            "I didn't understand that format. Try:\n" +
            "EDIT 2 hours 8\n" +
            "EDIT 2 project Perimeter\n" +
            "EDIT 2 persons 3\n" +
            "EDIT 2 task Updated description\n" +
            "EDIT date 2026-05-27"
          )
          return
        }

        // Date correction
        if (cmd.field === 'date') {
          const corrected = parseFlexibleDate(cmd.value)
          if (!corrected) {
            await sendWhatsAppMessage(from, `Couldn't parse that date. Try: EDIT date 2026-05-27`)
            return
          }
          pending.extractedDate = corrected
          await savePendingDB(from, pending)
          const resp = await sendConfirmation(from, pending)
          console.log(`[WA] Date corrected to ${corrected}, confirmation resent:`, resp)
          return
        }

        const row = pending.entries.find(e => e.rowNumber === cmd.row)
        if (!row) {
          await sendWhatsAppMessage(from,
            `Row ${cmd.row} not found. Valid rows: ${pending.entries.map(e => e.rowNumber).join(', ')}`
          )
          return
        }

        if (cmd.field === 'hours')   row.hours       = parseFloat(cmd.value) || row.hours
        if (cmd.field === 'persons') row.personCount  = parseInt(cmd.value)   || row.personCount
        if (cmd.field === 'task')    row.taskDescription = cmd.value

        if (cmd.field === 'project') {
          row.projectCategory = cmd.value
          const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
          const match = findClosestProject(cmd.value, allProjects)
          if (match) {
            row.projectId          = match.project.id
            row.projectName        = match.project.name
            row.unknownProject     = false
            row.fuzzyMatchOriginal = match.fuzzy ? cmd.value : null
          } else {
            row.projectId          = null
            row.projectName        = null
            row.unknownProject     = true
            row.fuzzyMatchOriginal = null
          }
        }

        console.log(`[WA] Applied EDIT cmd to row ${cmd.row}:`, row)
        await savePendingDB(from, pending)
        const resp = await sendConfirmation(from, pending)
        console.log('[WA] Updated confirmation sent:', resp)
        return
      }

      /* CREATE */
      if (upper === 'CREATE') {
        console.log(`[WA] Command: CREATE`)
        const pending = await loadPendingDB(from)
        if (!pending) {
          await sendWhatsAppMessage(from, "Your session has expired ⏰\n\nPlease send your timesheet photo again.")
          return
        }
        const unknownRow = pending.entries.find(e => e.unknownProject)
        if (!unknownRow) {
          await sendWhatsAppMessage(from, "No unknown projects to create.")
          return
        }
        console.log(`[WA] Creating project: "${unknownRow.projectCategory}"`)
        const firstClient = await prisma.client.findFirst()
        if (!firstClient) {
          await sendWhatsAppMessage(from, "No clients found. Please add a client in Chronicle first.")
          return
        }
        const newProj = await prisma.project.create({
          data: { name: unknownRow.projectCategory!, clientId: firstClient.id, billingType: 'INTERNAL' },
        })
        console.log(`[WA] Project created — id: ${newProj.id}, name: "${newProj.name}"`)
        unknownRow.projectId      = newProj.id
        unknownRow.projectName    = newProj.name
        unknownRow.unknownProject = false
        await savePendingDB(from, pending)
        const resp = await sendConfirmation(from, pending)
        console.log('[WA] Confirmation after CREATE:', resp)
        return
      }

      /* SKIP */
      if (upper === 'SKIP') {
        console.log(`[WA] Command: SKIP`)
        const pending = await loadPendingDB(from)
        if (!pending) {
          await sendWhatsAppMessage(from, "Your session has expired ⏰\n\nPlease send your timesheet photo again.")
          return
        }
        const unknownRow = pending.entries.find(e => e.unknownProject)
        if (unknownRow) {
          console.log(`[WA] Skipping unknown project row ${unknownRow.rowNumber}: "${unknownRow.projectCategory}"`)
          unknownRow.projectId      = null
          unknownRow.projectName    = null
          unknownRow.unknownProject = false
          unknownRow.isInternal     = true
        }
        await savePendingDB(from, pending)
        const resp = await sendConfirmation(from, pending)
        console.log('[WA] Confirmation after SKIP:', resp)
        return
      }

      /* Unknown text — try as project name */
      console.log(`[WA] Unknown command — checking if "${text}" matches a project name`)
      const pending = await loadPendingDB(from)
      if (pending) {
        const unknownRow = pending.entries.find(e => e.unknownProject)
        if (unknownRow) {
          const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
          const match = findClosestProject(text, allProjects)
          console.log(`[WA] Project match for "${text}":`, match ? `${match.project.name} (fuzzy: ${match.fuzzy})` : 'not found')
          if (match) {
            unknownRow.projectId          = match.project.id
            unknownRow.projectName        = match.project.name
            unknownRow.unknownProject     = false
            unknownRow.fuzzyMatchOriginal = match.fuzzy ? text : null
            await savePendingDB(from, pending)
            const resp = await sendConfirmation(from, pending)
            console.log('[WA] Matched project, confirmation resent:', resp)
            return
          }
        }
        const resp = await sendWhatsAppMessage(from,
          "I didn't understand that. Reply:\n" +
          "✅ YES — save all entries\n" +
          "✏️ EDIT [row] [field] [value]\n" +
          "   Examples: EDIT 4 persons 3 | EDIT 1 project Perimeter\n" +
          "❌ NO — cancel"
        )
        console.log('[WA] Help prompt sent:', resp)
      } else {
        console.log(`[WA] No pending for ${from} — ignoring unknown command`)
      }
    } else {
      console.log(`[WA] Branch: UNKNOWN type "${type}" — ignoring`)
    }
  } catch (e) {
    console.error('[WA] processMessage error:', e)
  }
}
