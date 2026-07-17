// Vercel serverless function: /api/intent
// Holds the OpenAI key server-side (env var OPENAI_API_KEY — never shipped to
// the client) and converts free text into a structured intent. It knows the
// full store/landmark catalog so the model can fuzzy-map phrases like
// "the Apple reseller" → IMAGINE. It NEVER computes routes — that stays in
// the deterministic engine on the client.

import { FLOORS, LANDMARKS } from '../src/data/stores.js'

const STORE_LINES = FLOORS.flatMap((f) =>
  f.stores.map((s) => `- ${s.name} (${s.category}, ${f.label})`)
)
const LANDMARK_LINES = LANDMARKS.filter((l) => l.floor === 'G' || l.name === 'Food Court').map(
  (l) => `- ${l.name}`
)
const CATEGORIES = [...new Set(FLOORS.flatMap((f) => f.stores.map((s) => s.category)))]

const INSTRUCTIONS = `You are the intent parser for wayFin, a navigation assistant for Orion Mall, Brigade Gateway (Bengaluru).
Convert the user's message into structured intent JSON. You NEVER give directions, routes, or distances — another system does that.

STORES (name, category, floor):
${STORE_LINES.join('\n')}

LANDMARKS / POSSIBLE ORIGINS:
${LANDMARK_LINES.join('\n')}

CATEGORIES: ${CATEGORIES.join(', ')}
PARKING LEVELS: P1, P2, P3

Rules:
- intent is one of: navigate, friend, parking, offers, store_search, unknown.
- Fill origin/destination/friendLocation ONLY with names copied EXACTLY from the lists above. Never invent a name.
- Fuzzy-map descriptions to catalogue names: "the Apple reseller" → IMAGINE; "that makeup store" → SEPHORA; "the main entrance" → Mall Entry 2; "toy store" → HAMLEYS; "coffee" → STARBUCKS.
- "near X" / "at X" / "came from X" describes the user's origin. "to X" / "find X" / "where is X" describes the destination.
- If the user wants a KIND of store without naming one ("closest shoe shop"), use intent store_search and set category to the closest listed category (e.g. Footwear).
- friend = anything about meeting/finding a person; set friendLocation if their spot is mentioned, origin if the user's own spot is mentioned.
- parking = saving or recalling a parking spot; set parkingLevel if P1/P2/P3 (or "second basement" style phrasing) is mentioned.
- offers = asking about discounts, deals, sales.
- confidence: 0..1. If you are not sure which catalogue entry the user means, use confidence below 0.6.
- Unmatched fields must be null. Reply with JSON only.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['navigate', 'friend', 'parking', 'offers', 'store_search', 'unknown'],
    },
    origin: { type: ['string', 'null'] },
    destination: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    friendLocation: { type: ['string', 'null'] },
    parkingLevel: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: [
    'intent',
    'origin',
    'destination',
    'category',
    'friendLocation',
    'parkingLevel',
    'confidence',
  ],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.OPENAI_API_KEY
  if (!key) return res.status(503).json({ error: 'OPENAI_API_KEY not configured' })

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 300) return res.status(400).json({ error: 'bad message' })

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: INSTRUCTIONS,
        input: message,
        temperature: 0,
        max_output_tokens: 200,
        text: {
          format: { type: 'json_schema', name: 'mall_intent', schema: SCHEMA, strict: true },
        },
      }),
    })
    if (!r.ok) {
      const detail = await r.text()
      return res.status(502).json({ error: 'llm_error', detail: detail.slice(0, 200) })
    }
    const data = await r.json()
    const text =
      data.output_text ??
      data.output
        ?.flatMap((o) => o.content ?? [])
        .find((c) => c.type === 'output_text')?.text
    const parsed = JSON.parse(text)
    return res.status(200).json(parsed)
  } catch (err) {
    return res.status(500).json({ error: 'parse_failed' })
  }
}
