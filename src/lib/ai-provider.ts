import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export interface ExtractedEntry {
  rowNumber: number
  taskDescription: string
  projectCategory: string | null
  designer: string | null
  hours: number
  isMeeting: boolean
  isInternal: boolean
  personCount: number | null
}

interface ExtractionResult {
  date: string | null
  entries: ExtractedEntry[]
}

const EXTRACTION_PROMPT = `
You are reading a handwritten timesheet from Goku Studio.
Extract all task entries from this image.

The physical sheet columns are:
- S.No: row number
- Project: the task description (what was worked on)
- Client (mislabeled — actually means Project/Category): e.g. Digimap, Phaco, Meeting
- Designer: person name who did the work
- Hours: hours worked

Rules:
1. If Client/Category column is empty → isInternal: true
2. If Designer says "X persons" or a number → isMeeting: true, set personCount
3. Meetings appear as "Meeting for X" or "Gmeet for X"
4. Extract the date from the sheet header if visible
5. Return ONLY valid JSON. No explanation, no markdown backticks.

Response format:
{
  "date": "YYYY-MM-DD or null if not visible",
  "entries": [
    {
      "rowNumber": 1,
      "taskDescription": "string",
      "projectCategory": "string or null",
      "designer": "string or null",
      "hours": number,
      "isMeeting": boolean,
      "isInternal": boolean,
      "personCount": number or null
    }
  ]
}
`

function parseJson(text: string): ExtractionResult {
  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  try {
    return JSON.parse(cleaned) as ExtractionResult
  } catch {
    throw new Error(`Failed to parse AI response as JSON. Raw response: ${text.slice(0, 500)}`)
  }
}

async function extractWithGemini(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const result = await model.generateContent([
    {
      inlineData: { mimeType, data: base64Image },
    },
    { text: EXTRACTION_PROMPT },
  ])

  const text = result.response.text()
  return parseJson(text)
}

async function extractWithClaude(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client = new Anthropic({ apiKey })

  const validMime = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: validMime, data: base64Image },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
  })

  const text = message.content
    .filter(c => c.type === 'text')
    .map(c => (c as { type: 'text'; text: string }).text)
    .join('')
  return parseJson(text)
}

async function extractWithOpenAI(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      },
    ],
    max_tokens: 2048,
  })

  const text = response.choices[0]?.message?.content ?? ''
  return parseJson(text)
}

export async function extractTimesheetFromImage(
  base64Image: string,
  mimeType: string
): Promise<ExtractionResult> {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase()

  if (provider === 'claude') return extractWithClaude(base64Image, mimeType)
  if (provider === 'openai') return extractWithOpenAI(base64Image, mimeType)
  return extractWithGemini(base64Image, mimeType)
}
