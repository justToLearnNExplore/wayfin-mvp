// Vercel serverless function: /api/intent
// Holds the Gemini key server-side (env var GEMINI_API_KEY — never shipped to
// the client) and converts free text into a structured intent. It knows the
// full store/landmark catalog so the model can fuzzy-map phrases like
// "the Apple reseller" → IMAGINE. It NEVER computes routes — that stays in
// the deterministic engine on the client.

import { FLOORS, LANDMARKS, PARKING_NODES } from '../src/data/stores.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

const STORE_LINES = FLOORS.flatMap((f) =>
  f.stores.map((s) => `- ${s.name} (${s.category}, ${f.label})`)
)
const LANDMARK_LINES = LANDMARKS.filter((l) => l.floor === 'G' || l.name === 'Food Court').map(
  (l) => `- ${l.name}`
)
const PARKING_LINES = PARKING_NODES.filter((node) => node.type === 'zone').map(
  (node) => `- ${node.name} (${node.floor})`
)
const CATEGORIES = [...new Set(FLOORS.flatMap((f) => f.stores.map((s) => s.category)))]

const INSTRUCTIONS = `You are the intent parser for wayFin, a navigation assistant for Orion Mall, Brigade Gateway (Bengaluru).
Convert the user's message into structured intent JSON. You NEVER give directions, routes, or distances — another system does that.

STORES (name, category, floor):
${STORE_LINES.join('\n')}

LANDMARKS / POSSIBLE ORIGINS:
${LANDMARK_LINES.join('\n')}

PARKING ZONES / POSSIBLE ORIGINS:
${PARKING_LINES.join('\n')}

CATEGORIES: ${CATEGORIES.join(', ')}
PARKING LEVELS: P1, P2, P3

Rules:
- intent is one of: navigate, friend, parking, offers, store_search, unknown.
- Fill origin/destination/friendLocation ONLY with names copied EXACTLY from the lists above. Never invent a name.
- Fuzzy-map descriptions to catalogue names: "the Apple reseller" → IMAGINE; "that makeup store" → SEPHORA; "the main entrance" → Mall Entry 2; "toy store" → HAMLEYS; "coffee" → STARBUCKS.
- "near X" / "at X" / "came from X" / "I came from X" describes the user's origin ONLY — leave destination null unless a separate destination is also stated.
- "to X" / "find X" / "where is X" / "take me to X" describes the destination.
- If the user wants a KIND of store without naming one ("closest shoe shop"), use intent store_search and set category to the closest listed category (e.g. Footwear).
- friend = anything about meeting/finding a person; set friendLocation if their spot is mentioned, origin if the user's own spot is mentioned.
- parking = saving or recalling a parking spot; set parkingLevel if P1/P2/P3 (or "second basement" style phrasing) is mentioned.
- A navigation request from or to a parking zone is still intent = navigate. For "from Zone A, P1 to UNIQLO", set origin = "Zone A", destination = "UNIQLO", and parkingLevel = "P1".
- offers = asking about discounts, deals, sales.
- confidence: 0..1. If you are not sure which catalogue entry the user means, use confidence below 0.6.
- Unmatched fields must be null. Reply with JSON only, matching the response schema exactly.`

// Gemini structured-output schema (OpenAPI subset: uppercase types, `nullable`
// flag instead of union types).
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['navigate', 'friend', 'parking', 'offers', 'store_search', 'unknown'],
    },
    origin: { type: 'STRING', nullable: true },
    destination: { type: 'STRING', nullable: true },
    category: { type: 'STRING', nullable: true },
    friendLocation: { type: 'STRING', nullable: true },
    parkingLevel: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
  },
  required: ['intent', 'origin', 'destination', 'category', 'friendLocation', 'parkingLevel', 'confidence'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY not configured' })

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 300) return res.status(400).json({ error: 'bad message' })

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      }
    )
    if (!r.ok) {
      const detail = await r.text()
      return res.status(502).json({ error: 'llm_error', detail: detail.slice(0, 900) })
    }
    const data = await r.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return res.status(502).json({ error: 'empty_response' })
    const parsed = JSON.parse(text)
    return res.status(200).json(parsed)
  } catch {
    return res.status(500).json({ error: 'parse_failed' })
  }
}
