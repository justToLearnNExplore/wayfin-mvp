// Vercel serverless function: /api/localize-vision
//
// Answers exactly one question: "which landmark in the mall catalogue is
// visible in this photo?" It never returns coordinates, floors or node ids
// from the model — those are resolved server-side from our own dataset, so a
// hallucinated brand name is discarded rather than teleporting the user.
//
// The OpenAI key lives only in the server env and is never shipped to the PWA.

import { cataloguePromptLines, resolveLandmark } from '../src/services/vision/catalogue.js'

const MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini'

/** Below this the UI must confirm with the user instead of auto-placing. */
const AUTO_PLACE_CONFIDENCE = 0.85

const INSTRUCTIONS = `You are the visual localizer for wayFin at Orion Mall, Brigade Gateway (Bengaluru).
A shopper has photographed their surroundings. Identify WHERE THEY ARE STANDING from visible evidence.

${cataloguePromptLines()}

Rules:
- Return "landmark" as a name copied EXACTLY from the lists above, or null.
- Prefer store signage: a readable brand sign is the strongest evidence of position.
- Only fall back to a structural landmark (escalator, atrium, entry, lift) when no brand sign is legible.
- NEVER guess a brand that is not in the list, even if you recognise the real-world brand.
- If the photo is blurred, dark, shows only floor/ceiling, or shows no identifiable landmark, return landmark: null.
- confidence is 0..1 and must reflect how certain you are of the SPECIFIC named landmark.
  A clearly readable shopfront sign is 0.9+. An inferred or partially occluded sign is 0.5-0.8.
  A generic corridor is below 0.3.
- visibleText: list any store or wayfinding text you can actually read in the image. Empty array if none.
Reply with JSON only.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    landmark: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    visibleText: { type: 'array', items: { type: 'string' } },
  },
  required: ['landmark', 'confidence', 'visibleText'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.OPENAI_API_KEY
  // Deliberate: report unavailability so the client can offer the manual
  // landmark picker. We never fabricate a recognition result.
  if (!key) return res.status(503).json({ error: 'vision_unavailable' })

  const image = typeof req.body?.image === 'string' ? req.body.image : ''
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image) || image.length > 5_500_000) {
    return res.status(400).json({ error: 'invalid_image' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Where in the mall was this photo taken?' },
              { type: 'input_image', image_url: image, detail: 'high' },
            ],
          },
        ],
        temperature: 0,
        max_output_tokens: 200,
        text: {
          format: { type: 'json_schema', name: 'mall_localization', schema: SCHEMA, strict: true },
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return res.status(502).json({ error: 'vision_error', detail: detail.slice(0, 300) })
    }

    const data = await response.json()
    const text =
      data.output_text ??
      data.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text
    if (!text) return res.status(502).json({ error: 'empty_response' })

    const parsed = JSON.parse(text)

    // ---- validation boundary -------------------------------------------
    // Everything past this point comes from OUR dataset, never the model.
    const entry = resolveLandmark(parsed.landmark)
    if (!entry) {
      return res.status(200).json({
        landmark: null,
        confidence: 0,
        matches: [],
        ambiguous: false,
        autoPlace: false,
        visibleText: Array.isArray(parsed.visibleText) ? parsed.visibleText.slice(0, 8) : [],
      })
    }

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))

    return res.status(200).json({
      landmark: entry.name,
      kind: entry.kind,
      confidence,
      matches: entry.matches,
      // A name on several floors can't be placed from a photo alone.
      ambiguous: entry.ambiguous,
      autoPlace: confidence >= AUTO_PLACE_CONFIDENCE && !entry.ambiguous,
      visibleText: Array.isArray(parsed.visibleText) ? parsed.visibleText.slice(0, 8) : [],
    })
  } catch {
    return res.status(500).json({ error: 'localize_failed' })
  }
}
