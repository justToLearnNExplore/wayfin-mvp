// Vercel serverless function: /api/intent
//
// Converts free text into a structured intent. It knows the full
// store/landmark catalogue so the model can fuzzy-map phrases like "the Apple
// reseller" → IMAGINE. It NEVER computes routes — that stays in the
// deterministic engine on the client.
//
// Provider-agnostic: runs on whichever LLM key is configured (see
// ../src/services/llm/provider.js). The key lives only in the server env and
// is never shipped to the PWA.

import { FLOORS, LANDMARKS, PARKING_NODES } from '../src/data/stores.js'
import { resolveProvider, generateJson, LlmError } from '../src/services/llm/provider.js'

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

// Standard JSON Schema. The provider layer translates it to Gemini's
// OpenAPI-subset dialect when that backend is in use, so this stays in one
// form regardless of who answers.
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
  required: ['intent', 'origin', 'destination', 'category', 'friendLocation', 'parkingLevel', 'confidence'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const provider = resolveProvider()
  // Reported honestly so the client falls back to offline keyword matching
  // rather than showing the user a broken chat.
  if (!provider) return res.status(503).json({ error: 'llm_not_configured' })

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 300) return res.status(400).json({ error: 'bad message' })

  try {
    const parsed = await generateJson({
      provider,
      instructions: INSTRUCTIONS,
      userText: message,
      schema: SCHEMA,
      schemaName: 'wayfin_intent',
      maxTokens: 300,
    })
    return res.status(200).json(parsed)
  } catch (err) {
    if (err instanceof LlmError) {
      return res.status(502).json({ error: `llm_${err.kind}`, detail: err.detail })
    }
    return res.status(500).json({ error: 'parse_failed' })
  }
}
