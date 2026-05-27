import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWhatsAppList } from '@/lib/whatsapp'
import { extractTimesheetFromImage } from '@/lib/ai-provider'

/* ── Types ───────────────────────────────────────────────────── */

interface PendingEntry {
  rowNumber:          number
  taskDescription:    string
  projectCategory:    string | null
  projectId:          string | null
  projectName:        string | null
  fuzzyMatchOriginal: string | null
  designer:           string | null
  memberId:           string | null
  hours:              number
  isMeeting:          boolean
  isInternal:         boolean
  personCount:        number | null
  unknownProject:     boolean
  skipped?:           boolean
}

interface EditState {
  step: 'awaiting_hours' | 'awaiting_task' | 'awaiting_date' | 'awaiting_persons'
  row?: number
}

interface PendingData {
  extractedDate:   string | null
  entries:         PendingEntry[]
  editState?:      EditState | null
  dateConfirmed?:  boolean
  hoursConfirmed?: boolean
}

interface EditCommand {
  row:   number  // -1 = date-level edit
  field: string
  value: string
}

type MemberRef = { name: string }

/* ── Constants ───────────────────────────────────────────────── */

const MONTH_MAP: Record<string, number> = {
  january:1,  february:2,  march:3,     april:4,    may:5,      june:6,
  july:7,     august:8,    september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
}
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/* ── Phone normalisation ─────────────────────────────────────── */

function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/* ── Fuzzy project matching ──────────────────────────────────── */

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

/* ── Pending state — DB ──────────────────────────────────────── */

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

/* ── Duplicate detection ─────────────────────────────────────── */

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

/* ── Date helpers ────────────────────────────────────────────── */

function parseFlexibleDate(value: string): string | null {
  const v = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
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

function isDateSuspicious(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d   = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  const daysDiff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return daysDiff > 0 || daysDiff < -7
}

/* ── EDIT command parser ─────────────────────────────────────── */

function parseEditCommand(text: string): EditCommand | null {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  const dateMatch = cleaned.match(/^EDIT\s+date\s+(.+)$/i)
  if (dateMatch) return { row: -1, field: 'date', value: dateMatch[1].trim() }
  const rowMatch = cleaned.match(/^EDIT\s+(\d+)\s+(\w+)\s+(.+)$/i)
  if (!rowMatch) return null
  return {
    row:   parseInt(rowMatch[1]),
    field: rowMatch[2].toLowerCase(),
    value: rowMatch[3].replace(/h$/i, '').trim(),
  }
}

/* ── Confirmation message (text body) ───────────────────────── */

function buildConfirmationMessage(entries: PendingEntry[], date: string | null): string {
  const dateDisplay = formatConfirmationDate(date)
  const warnings: string[] = []
  const memberTotals: Record<string, number> = {}
  let totalHours = 0

  let msg = `📋 Timesheet for ${dateDisplay}\n\n`

  for (const e of entries) {
    if (e.skipped) {
      msg += `${e.rowNumber}. ⏭ Skipped\n\n`
      continue
    }
    if (e.isMeeting) {
      const personStr = e.personCount == null ? '2 persons (assumed)' : `${e.personCount} persons`
      if (e.personCount == null)
        warnings.push(`⚠️ Row ${e.rowNumber}: person count assumed as 2`)
      msg += `${e.rowNumber}. Meeting | ${personStr} | ${e.hours}h\n\n`
      totalHours += e.hours * (e.personCount ?? 2)
    } else if (e.unknownProject) {
      msg += `${e.rowNumber}. ⚠️ Unknown: "${e.projectCategory}" | ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No description]'}\n\n`
    } else if (e.fuzzyMatchOriginal) {
      msg += `${e.rowNumber}. ⚠️ "${e.fuzzyMatchOriginal}" → ${e.projectName} | ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No description]'}\n\n`
      totalHours += e.hours
      if (e.designer) memberTotals[e.designer] = (memberTotals[e.designer] ?? 0) + e.hours
    } else {
      const projLabel = e.isInternal
        ? (e.projectName ? `Internal · ${e.projectName}` : 'Internal')
        : (e.projectName ?? e.projectCategory ?? 'Unknown')
      msg += `${e.rowNumber}. ${projLabel} | ${e.designer ?? '?'}: ${e.hours}h\n`
      msg += `   ${e.taskDescription || '[No description]'}\n\n`
      totalHours += e.hours
      if (e.designer) memberTotals[e.designer] = (memberTotals[e.designer] ?? 0) + e.hours
    }
  }

  const activeCount = entries.filter(e => !e.skipped && !e.unknownProject).length
  msg += `Total: ${totalHours}h across ${activeCount} ${activeCount === 1 ? 'entry' : 'entries'}`

  for (const [name, total] of Object.entries(memberTotals)) {
    if (total > 12) warnings.push(`⚠️ ${name}'s total is ${total}h`)
  }
  if (warnings.length) msg += '\n\n' + warnings.join('\n')

  return msg
}

/* ── Send confirmation + action buttons ─────────────────────── */

async function sendConfirmationWithButtons(phone: string, data: PendingData): Promise<void> {
  await sendWhatsAppMessage(phone, buildConfirmationMessage(data.entries, data.extractedDate))

  // Unresolved unknown projects get resolution buttons first — block save until resolved
  const firstUnknown = data.entries.find(e => e.unknownProject && !e.skipped)
  if (firstUnknown) {
    await sendWhatsAppButtons(
      phone,
      `⚠️ Row ${firstUnknown.rowNumber}: "${firstUnknown.projectCategory}" wasn't found.\n\nWhat should I do?`,
      [
        { id: `create_project_${firstUnknown.rowNumber}`, title: '➕ Add as new project' },
        { id: `mark_internal_${firstUnknown.rowNumber}`,  title: '🏠 Mark as internal'   },
        { id: `skip_row_${firstUnknown.rowNumber}`,       title: '⏭ Skip this entry'     },
      ],
    )
    return
  }

  // Date check — only show once per session
  if (!data.dateConfirmed && isDateSuspicious(data.extractedDate)) {
    await sendWhatsAppButtons(
      phone,
      `📅 I read the date as ${formatConfirmationDate(data.extractedDate)}. Is this correct?`,
      [
        { id: 'date_correct', title: '✅ Yes, correct' },
        { id: 'date_wrong',   title: '✏️ Change date'  },
      ],
    )
  }

  // Hours sanity check — only show once per session
  if (!data.hoursConfirmed) {
    const memberTotals: Record<string, number> = {}
    for (const e of data.entries) {
      if (e.designer && !e.isMeeting && !e.skipped) {
        memberTotals[e.designer] = (memberTotals[e.designer] ?? 0) + e.hours
      }
    }
    const highEntry = Object.entries(memberTotals).find(([, t]) => t > 12)
    if (highEntry) {
      await sendWhatsAppButtons(
        phone,
        `⚠️ ${highEntry[0]} has ${highEntry[1]}h for this date. That seems high — is this correct?`,
        [
          { id: 'hours_correct', title: '✅ Yes, correct'  },
          { id: 'hours_edit',    title: '✏️ Let me fix it' },
        ],
      )
    }
  }

  // Main action buttons
  await sendWhatsAppButtons(
    phone,
    'What would you like to do?',
    [
      { id: 'btn_yes',  title: '✅ Save all'     },
      { id: 'btn_edit', title: '✏️ Edit entries' },
      { id: 'btn_no',   title: '❌ Cancel'        },
    ],
    undefined,
    'Tap Save to log these entries to Chronicle',
  )
}

/* ── Execute save ────────────────────────────────────────────── */

async function executeSave(from: string, member: MemberRef, pending: PendingData): Promise<void> {
  const entryDate = pending.extractedDate
    ? new Date(pending.extractedDate + 'T12:00:00')
    : new Date()

  let savedCount = 0, skippedCount = 0
  const skippedTasks: string[] = []
  const savedProjectNames: string[] = []

  for (const e of pending.entries) {
    if (e.unknownProject || e.skipped) {
      console.log(`[WA] Skipping row ${e.rowNumber} — ${e.skipped ? 'explicitly skipped' : 'unresolved project'}`)
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

  // Clear pending first — even if activity log fails
  await clearPendingDB(from)
  console.log(`[WA] Cleared pending. Saved: ${savedCount}, skipped: ${skippedCount}`)

  // Activity log — non-fatal
  try {
    await prisma.activityLog.create({
      data: {
        action:    'whatsapp.extracted',
        actorName: member.name,
        detail: {
          date:        pending.extractedDate,
          savedCount,
          skippedCount,
          submittedBy: member.name,
          projects:    Array.from(new Set(savedProjectNames)),
        },
      },
    })
    console.log('[WA] Activity log created')
  } catch (err) {
    console.error('[WA] Failed to create activity log:', err)
  }

  const dateLabel = pending.extractedDate ? formatConfirmationDate(pending.extractedDate) : 'today'
  const uniqueProjects = Array.from(new Set(savedProjectNames))
  const projectSummary = uniqueProjects.length > 0 ? `\nProjects: ${uniqueProjects.join(', ')}` : ''
  const skippedLine    = skippedCount > 0 ? `\n⏭ ${skippedCount} already logged, skipped` : ''
  const now            = new Date()
  const timeStr        = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

  await sendWhatsAppButtons(
    from,
    `✅ Saved ${savedCount} ${savedCount === 1 ? 'entry' : 'entries'} for ${dateLabel}${projectSummary}${skippedLine}`,
    [
      { id: 'send_another', title: '📷 Log another day' },
      { id: 'done',         title: '👍 Done'            },
    ],
    'Chronicle updated',
    `Logged via Chrono · ${timeStr}`,
  )
}

/* ── Session expired helper ──────────────────────────────────── */

async function sessionExpired(from: string): Promise<void> {
  await sendWhatsAppMessage(from,
    "Your session has expired ⏰\n\nPlease send your timesheet photo again to start a new extraction."
  )
}

/* ── Webhook verification (GET) ──────────────────────────────── */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN)
    return new NextResponse(challenge, { status: 200 })
  return new NextResponse('Forbidden', { status: 403 })
}

/* ── Incoming messages (POST) ────────────────────────────────── */

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    await processMessage(body)
  } catch (err) {
    console.error('[WA] Processing error:', err)
  }
  return NextResponse.json({ status: 'ok' })
}

/* ── Main processor ──────────────────────────────────────────── */

async function processMessage(body: Record<string, unknown>) {
  try {
    console.log('[WA] Incoming webhook body:', JSON.stringify(body, null, 2))

    const entry = (body as {
      entry?: { changes?: { value?: {
        messages?: {
          from: string
          type: string
          text?:        { body: string }
          image?:       { id: string; mime_type: string }
          interactive?: {
            type:         'button_reply' | 'list_reply'
            button_reply?: { id: string; title: string }
            list_reply?:   { id: string; title: string }
          }
        }[]
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

    /* ── Member lookup ──────────────────────────────────────── */
    const senderLast10    = normalisePhone(from)
    const allActiveMembers = await prisma.teamMember.findMany({ where: { isActive: true } })
    console.log('[WA] Active members:', allActiveMembers.map(m => ({
      name: m.name, normalised: m.whatsappNumber ? normalisePhone(m.whatsappNumber) : null,
    })))

    const member = allActiveMembers.find(m =>
      m.whatsappNumber !== null && normalisePhone(m.whatsappNumber) === senderLast10
    )
    console.log('[WA] Member found:', member?.name ?? 'NOT FOUND')

    if (!member) {
      await sendWhatsAppMessage(from,
        "👋 Hi! This is Chrono, Chronicle's private timesheet assistant for Goku Studio.\n\n" +
        "Your number isn't registered. Please ask your administrator to add your WhatsApp number in Chronicle → Settings → Team Members."
      )
      return
    }

    /* ── Interactive reply ──────────────────────────────────── */
    if (type === 'interactive') {
      const replyId = message.interactive?.button_reply?.id
                   ?? message.interactive?.list_reply?.id
                   ?? null
      console.log(`[WA] Branch: INTERACTIVE — replyId: ${replyId}`)
      if (replyId) await handleInteractiveReply(from, member, replyId)
      return
    }

    /* ── IMAGE ──────────────────────────────────────────────── */
    if (type === 'image' && message.image) {
      console.log(`[WA] Branch: IMAGE — imageId: ${message.image.id}`)

      const existingPending = await loadPendingDB(from)
      await sendWhatsAppMessage(from,
        existingPending
          ? "Got it — replacing your previous timesheet with this new one... 📋"
          : "Got it, reading your timesheet... 📋"
      )

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
      console.log(`[WA] Image downloaded — base64 length: ${base64.length}`)

      let extracted
      try {
        extracted = await extractTimesheetFromImage(base64, mimeType)
        console.log('[WA] Extraction result:', JSON.stringify(extracted, null, 2))
        if (!extracted?.entries?.length) throw new Error('No entries extracted')
      } catch (err) {
        console.error('[WA] Extraction failed:', err)
        await sendWhatsAppMessage(from,
          "I couldn't read your timesheet clearly 📷\n\n" +
          "Please try again with:\n• Better lighting\n• Camera held straight above the sheet\n• Make sure all columns are visible"
        )
        return
      }

      const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
      console.log(`[WA] Loaded ${allProjects.length} active projects`)

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

      console.log(`[WA] Mapped ${entries.length} entries — unknown: ${entries.filter(e => e.unknownProject).length}`)

      const pendingData: PendingData = { extractedDate: extracted.date, entries }
      await savePendingDB(from, pendingData)
      await sendConfirmationWithButtons(from, pendingData)
      return
    }

    /* ── TEXT ───────────────────────────────────────────────── */
    if (type === 'text') {
      const text  = (message.text?.body ?? '').trim()
      const upper = text.toUpperCase()
      console.log(`[WA] Branch: TEXT — raw: "${text}"`)

      const pending = await loadPendingDB(from)

      // Handle edit state (waiting for typed input from user)
      if (pending?.editState) {
        await handleEditStateInput(from, pending, text)
        return
      }

      // Text fallback commands
      if (upper === 'YES' || upper === 'Y') {
        await handleSaveCommand(from, member, pending)
        return
      }
      if (upper === 'NO' || upper === 'N') {
        await handleCancelCommand(from, pending)
        return
      }
      if (upper.startsWith('EDIT')) {
        await handleEditTextCommand(from, pending, text)
        return
      }
      if (upper === 'CREATE') {
        await handleCreateCommand(from, pending)
        return
      }
      if (upper === 'SKIP') {
        await handleSkipCommand(from, pending)
        return
      }

      // Try as a project name for unresolved row
      if (pending) {
        const unknownRow = pending.entries.find(e => e.unknownProject && !e.skipped)
        if (unknownRow) {
          const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
          const match = findClosestProject(text, allProjects)
          if (match) {
            unknownRow.projectId          = match.project.id
            unknownRow.projectName        = match.project.name
            unknownRow.unknownProject     = false
            unknownRow.fuzzyMatchOriginal = match.fuzzy ? text : null
            await savePendingDB(from, pending)
            await sendConfirmationWithButtons(from, pending)
            return
          }
        }
        await sendWhatsAppMessage(from,
          "I didn't understand that. Use the buttons above, or type:\n" +
          "YES — save all  ·  NO — cancel  ·  EDIT [row] [field] [value]"
        )
      } else {
        console.log(`[WA] No pending for ${from} — ignoring unknown text`)
      }
    } else {
      console.log(`[WA] Unsupported message type: ${type}`)
    }
  } catch (e) {
    console.error('[WA] processMessage error:', e)
  }
}

/* ── Interactive reply handler ───────────────────────────────── */

async function handleInteractiveReply(
  from:    string,
  member:  MemberRef,
  replyId: string,
): Promise<void> {
  console.log(`[WA] handleInteractiveReply — id: ${replyId}`)
  const pending = await loadPendingDB(from)

  /* btn_yes ──────────────────────────────────────────────────── */
  if (replyId === 'btn_yes') {
    await handleSaveCommand(from, member, pending)
    return
  }

  /* btn_no ───────────────────────────────────────────────────── */
  if (replyId === 'btn_no') {
    await handleCancelCommand(from, pending)
    return
  }

  /* btn_edit — show entry list ───────────────────────────────── */
  if (replyId === 'btn_edit') {
    if (!pending) { await sessionExpired(from); return }
    await sendEditList(from, pending)
    return
  }

  /* edit_row_{N} — field selection ───────────────────────────── */
  const editRowMatch = replyId.match(/^edit_row_(\d+)$/)
  if (editRowMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(editRowMatch[1])
    const e = pending.entries.find(r => r.rowNumber === rowNum)
    if (!e) { await sendWhatsAppMessage(from, `Row ${rowNum} not found.`); return }

    const projLabel = e.projectName ?? e.projectCategory ?? 'None'
    await sendWhatsAppButtons(
      from,
      `Editing Row ${rowNum}: ${(e.taskDescription ?? '[no description]').slice(0, 60)}\nProject: ${projLabel}\nHours: ${e.hours}h`,
      [
        { id: `edit_${rowNum}_project`, title: '🗂 Change project' },
        { id: `edit_${rowNum}_hours`,   title: '⏱ Change hours'   },
        { id: `edit_${rowNum}_task`,    title: '📝 Change task'    },
      ],
    )
    return
  }

  /* edit_{N}_project — show project list ─────────────────────── */
  const editProjectMatch = replyId.match(/^edit_(\d+)_project$/)
  if (editProjectMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(editProjectMatch[1])
    await sendProjectList(from, rowNum)
    return
  }

  /* edit_{N}_hours — prompt for typed hours ──────────────────── */
  const editHoursMatch = replyId.match(/^edit_(\d+)_hours$/)
  if (editHoursMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(editHoursMatch[1])
    pending.editState = { step: 'awaiting_hours', row: rowNum }
    await savePendingDB(from, pending)
    await sendWhatsAppMessage(from, `Please type the new hours for Row ${rowNum}:\nExample: 4.5`)
    return
  }

  /* edit_{N}_task — prompt for typed description ─────────────── */
  const editTaskMatch = replyId.match(/^edit_(\d+)_task$/)
  if (editTaskMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(editTaskMatch[1])
    pending.editState = { step: 'awaiting_task', row: rowNum }
    await savePendingDB(from, pending)
    await sendWhatsAppMessage(from, `Please type the new task description for Row ${rowNum}:`)
    return
  }

  /* project_{N}_{projectId} — update row project ─────────────── */
  const projectSelectMatch = replyId.match(/^project_(\d+)_(.+)$/)
  if (projectSelectMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(projectSelectMatch[1])
    const projId = projectSelectMatch[2]
    const row = pending.entries.find(e => e.rowNumber === rowNum)
    if (!row) { await sendWhatsAppMessage(from, `Row ${rowNum} not found.`); return }

    const project = await prisma.project.findUnique({ where: { id: projId } })
    if (!project) { await sendWhatsAppMessage(from, 'Project not found.'); return }

    row.projectId          = project.id
    row.projectName        = project.name
    row.projectCategory    = project.name
    row.unknownProject     = false
    row.fuzzyMatchOriginal = null
    row.isInternal         = project.billingType === 'INTERNAL'
    pending.editState      = null
    await savePendingDB(from, pending)
    console.log(`[WA] Row ${rowNum} project updated to "${project.name}"`)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  /* create_project_{N} — ask billing type ────────────────────── */
  const createProjectMatch = replyId.match(/^create_project_(\d+)$/)
  if (createProjectMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(createProjectMatch[1])
    const row = pending.entries.find(e => e.rowNumber === rowNum)
    if (!row) { await sendWhatsAppMessage(from, `Row ${rowNum} not found.`); return }

    await sendWhatsAppButtons(
      from,
      `Creating project: "${row.projectCategory}"\nWhat's the billing type?`,
      [
        { id: `billing_retainer_${rowNum}`, title: '💼 Retainership'    },
        { id: `billing_out_${rowNum}`,      title: '📋 Out of retainer' },
        { id: `billing_internal_${rowNum}`, title: '🏠 Internal'        },
      ],
    )
    return
  }

  /* billing_{type}_{N} — create project ──────────────────────── */
  const billingMatch = replyId.match(/^billing_(retainer|out|internal)_(\d+)$/)
  if (billingMatch) {
    if (!pending) { await sessionExpired(from); return }
    const billingKey = billingMatch[1]
    const rowNum     = parseInt(billingMatch[2])
    const row = pending.entries.find(e => e.rowNumber === rowNum)
    if (!row?.projectCategory) {
      await sendWhatsAppMessage(from, 'Could not find the project to create.')
      return
    }

    const billingType = (
      billingKey === 'retainer' ? 'RETAINERSHIP' :
      billingKey === 'out'      ? 'OUT_OF_RETAINERSHIP' :
                                  'INTERNAL'
    ) as 'RETAINERSHIP' | 'OUT_OF_RETAINERSHIP' | 'INTERNAL'

    const firstClient = await prisma.client.findFirst()
    if (!firstClient) {
      await sendWhatsAppMessage(from, 'No clients found in Chronicle. Please add a client first.')
      return
    }

    const newProj = await prisma.project.create({
      data: { name: row.projectCategory, clientId: firstClient.id, billingType },
    })
    console.log(`[WA] Project created: "${newProj.name}" (${billingType})`)

    row.projectId      = newProj.id
    row.projectName    = newProj.name
    row.unknownProject = false
    row.isInternal     = billingType === 'INTERNAL'
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  /* mark_internal_{N} ────────────────────────────────────────── */
  const markInternalMatch = replyId.match(/^mark_internal_(\d+)$/)
  if (markInternalMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(markInternalMatch[1])
    const row = pending.entries.find(e => e.rowNumber === rowNum)
    if (!row) { await sendWhatsAppMessage(from, `Row ${rowNum} not found.`); return }

    row.projectId      = null
    row.projectName    = null
    row.unknownProject = false
    row.isInternal     = true
    await savePendingDB(from, pending)
    console.log(`[WA] Row ${rowNum} marked as internal`)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  /* skip_row_{N} ─────────────────────────────────────────────── */
  const skipRowMatch = replyId.match(/^skip_row_(\d+)$/)
  if (skipRowMatch) {
    if (!pending) { await sessionExpired(from); return }
    const rowNum = parseInt(skipRowMatch[1])
    const row = pending.entries.find(e => e.rowNumber === rowNum)
    if (!row) { await sendWhatsAppMessage(from, `Row ${rowNum} not found.`); return }

    row.skipped = true
    await savePendingDB(from, pending)
    console.log(`[WA] Row ${rowNum} skipped`)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  /* date_correct ─────────────────────────────────────────────── */
  if (replyId === 'date_correct') {
    if (!pending) { await sessionExpired(from); return }
    pending.dateConfirmed = true
    await savePendingDB(from, pending)
    await sendWhatsAppMessage(from, '✅ Date confirmed.')
    return
  }

  /* date_wrong — prompt for typed date ───────────────────────── */
  if (replyId === 'date_wrong') {
    if (!pending) { await sessionExpired(from); return }
    pending.editState = { step: 'awaiting_date' }
    await savePendingDB(from, pending)
    await sendWhatsAppMessage(from, 'Please type the correct date:\nExample: 27/05/2026 or 2026-05-27')
    return
  }

  /* hours_correct ────────────────────────────────────────────── */
  if (replyId === 'hours_correct') {
    if (!pending) { await sessionExpired(from); return }
    pending.hoursConfirmed = true
    await savePendingDB(from, pending)
    await sendWhatsAppMessage(from, '✅ Hours confirmed.')
    return
  }

  /* hours_edit — show edit list ──────────────────────────────── */
  if (replyId === 'hours_edit') {
    if (!pending) { await sessionExpired(from); return }
    await sendEditList(from, pending)
    return
  }

  /* send_another ─────────────────────────────────────────────── */
  if (replyId === 'send_another') {
    await sendWhatsAppMessage(from, '📷 Ready for your next timesheet. Send it whenever you\'re ready!')
    return
  }

  /* done ─────────────────────────────────────────────────────── */
  if (replyId === 'done') {
    await sendWhatsAppMessage(from, '👋 All done! Have a productive day!')
    return
  }

  console.log(`[WA] Unknown interactive reply: ${replyId}`)
}

/* ── Edit state text input handler ──────────────────────────── */

async function handleEditStateInput(
  from:    string,
  pending: PendingData,
  text:    string,
): Promise<void> {
  const { editState } = pending
  if (!editState) return

  console.log(`[WA] handleEditStateInput — step: ${editState.step}, row: ${editState.row}, text: "${text}"`)

  if (editState.step === 'awaiting_date') {
    const corrected = parseFlexibleDate(text)
    if (!corrected) {
      await sendWhatsAppMessage(from, `Couldn't parse that date. Try: 27/05/2026 or 2026-05-27`)
      return
    }
    pending.extractedDate = corrected
    pending.dateConfirmed = true
    pending.editState     = null
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  const rowNum = editState.row
  if (rowNum == null) return

  const row = pending.entries.find(e => e.rowNumber === rowNum)
  if (!row) {
    await sendWhatsAppMessage(from, `Row ${rowNum} not found.`)
    pending.editState = null
    await savePendingDB(from, pending)
    return
  }

  if (editState.step === 'awaiting_hours') {
    const hours = parseFloat(text)
    if (isNaN(hours) || hours <= 0) {
      await sendWhatsAppMessage(from, 'Please enter a valid number, e.g. 4.5')
      return
    }
    row.hours         = hours
    pending.editState = null
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  if (editState.step === 'awaiting_task') {
    row.taskDescription = text
    pending.editState   = null
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  if (editState.step === 'awaiting_persons') {
    const count = parseInt(text)
    if (isNaN(count) || count <= 0) {
      await sendWhatsAppMessage(from, 'Please enter a valid number, e.g. 4')
      return
    }
    row.personCount   = count
    pending.editState = null
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }
}

/* ── Shared helper: send edit list ──────────────────────────── */

async function sendEditList(from: string, pending: PendingData): Promise<void> {
  const activeEntries = pending.entries.filter(e => !e.skipped)
  if (activeEntries.length === 0) {
    await sendWhatsAppMessage(from, 'No entries to edit.')
    return
  }
  await sendWhatsAppList(
    from,
    'Which entry do you want to edit?',
    'Select entry',
    [{
      title: 'Entries',
      rows: activeEntries.map(e => ({
        id:          `edit_row_${e.rowNumber}`,
        title:       `Row ${e.rowNumber}: ${(e.projectName ?? (e.isMeeting ? 'Meeting' : e.projectCategory ?? 'Unknown')).slice(0, 22)}`,
        description: `${(e.taskDescription ?? '').slice(0, 40)} · ${e.hours}h`,
      })),
    }],
  )
}

/* ── Shared helper: send project list ────────────────────────── */

async function sendProjectList(from: string, rowNum: number): Promise<void> {
  const projects = await prisma.project.findMany({
    where:   { archivedAt: null },
    include: { client: true },
    orderBy: { name: 'asc' },
  })

  if (projects.length === 0) {
    await sendWhatsAppMessage(from, 'No projects found in Chronicle. Please add projects first.')
    return
  }

  const byClient: Record<string, typeof projects> = {}
  for (const p of projects) {
    if (!byClient[p.client.name]) byClient[p.client.name] = []
    byClient[p.client.name].push(p)
  }

  const sections = Object.entries(byClient).map(([clientName, projs]) => ({
    title: clientName.slice(0, 24),
    rows: projs.map(p => ({
      id:          `project_${rowNum}_${p.id}`,
      title:       p.name.slice(0, 24),
      description: (
        p.billingType === 'RETAINERSHIP'         ? 'Retainership' :
        p.billingType === 'OUT_OF_RETAINERSHIP'  ? 'Out of retainer' :
                                                   'Internal'
      ),
    })),
  }))

  await sendWhatsAppList(from, `Select project for Row ${rowNum}:`, 'Choose project', sections)
}

/* ── Text command handlers ───────────────────────────────────── */

async function handleSaveCommand(
  from:    string,
  member:  MemberRef,
  pending: PendingData | null,
): Promise<void> {
  console.log('[WA] handleSaveCommand')
  if (!pending) { await sessionExpired(from); return }
  await executeSave(from, member, pending)
}

async function handleCancelCommand(from: string, pending: PendingData | null): Promise<void> {
  console.log('[WA] handleCancelCommand')
  if (!pending) { await sessionExpired(from); return }
  await clearPendingDB(from)
  await sendWhatsAppMessage(from, 'Cancelled. Nothing was saved. ❌')
}

async function handleEditTextCommand(
  from:    string,
  pending: PendingData | null,
  text:    string,
): Promise<void> {
  console.log(`[WA] handleEditTextCommand — "${text}"`)
  if (!pending) { await sessionExpired(from); return }

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

  if (cmd.field === 'date') {
    const corrected = parseFlexibleDate(cmd.value)
    if (!corrected) {
      await sendWhatsAppMessage(from, `Couldn't parse that date. Try: EDIT date 2026-05-27`)
      return
    }
    pending.extractedDate = corrected
    pending.dateConfirmed = true
    await savePendingDB(from, pending)
    await sendConfirmationWithButtons(from, pending)
    return
  }

  const row = pending.entries.find(e => e.rowNumber === cmd.row)
  if (!row) {
    await sendWhatsAppMessage(from,
      `Row ${cmd.row} not found. Valid rows: ${pending.entries.map(e => e.rowNumber).join(', ')}`
    )
    return
  }

  if (cmd.field === 'hours')   row.hours           = parseFloat(cmd.value) || row.hours
  if (cmd.field === 'persons') row.personCount      = parseInt(cmd.value)  || row.personCount
  if (cmd.field === 'task')    row.taskDescription  = cmd.value

  if (cmd.field === 'project') {
    row.projectCategory = cmd.value
    const allProjects = await prisma.project.findMany({ where: { archivedAt: null } })
    const match = findClosestProject(cmd.value, allProjects)
    if (match) {
      row.projectId          = match.project.id
      row.projectName        = match.project.name
      row.unknownProject     = false
      row.fuzzyMatchOriginal = match.fuzzy ? cmd.value : null
      row.isInternal         = match.project.billingType === 'INTERNAL'
    } else {
      row.projectId          = null
      row.projectName        = null
      row.unknownProject     = true
      row.fuzzyMatchOriginal = null
    }
  }

  await savePendingDB(from, pending)
  await sendConfirmationWithButtons(from, pending)
}

async function handleCreateCommand(from: string, pending: PendingData | null): Promise<void> {
  console.log('[WA] handleCreateCommand')
  if (!pending) { await sessionExpired(from); return }
  const unknownRow = pending.entries.find(e => e.unknownProject && !e.skipped)
  if (!unknownRow) {
    await sendWhatsAppMessage(from, 'No unknown projects to create.')
    return
  }
  await sendWhatsAppButtons(
    from,
    `Creating project: "${unknownRow.projectCategory}"\nWhat's the billing type?`,
    [
      { id: `billing_retainer_${unknownRow.rowNumber}`, title: '💼 Retainership'    },
      { id: `billing_out_${unknownRow.rowNumber}`,      title: '📋 Out of retainer' },
      { id: `billing_internal_${unknownRow.rowNumber}`, title: '🏠 Internal'        },
    ],
  )
}

async function handleSkipCommand(from: string, pending: PendingData | null): Promise<void> {
  console.log('[WA] handleSkipCommand')
  if (!pending) { await sessionExpired(from); return }
  const unknownRow = pending.entries.find(e => e.unknownProject && !e.skipped)
  if (unknownRow) unknownRow.skipped = true
  await savePendingDB(from, pending)
  await sendConfirmationWithButtons(from, pending)
}
