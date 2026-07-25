// Vercel serverless function: /api/product-match
// The model can only select one identifier from the mall store catalogue. It
// never supplies prices, sizes, links, or a visually-similar alternative.
//
// Note: the current UI (src/services/productMatcher.js) intentionally does
// NOT call this endpoint — the live demo uses a deterministic local stub so
// the price-match flow can never fail on stage. This route is kept ready for
// when the team wants to flip on live multi-SKU vision matching.

import { PRODUCTS } from '../src/data/products.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

const CATALOGUE = PRODUCTS.map(
  (product) =>
    `- id: ${product.id}; store: ${product.store}; brand: ${product.brand}; product: ${product.name}; visual: ${product.visualDescriptor}`
).join('\n')

const INSTRUCTIONS = `You verify a photographed retail item for Wayfin at Orion Mall, Bengaluru.
Your job is not visual search. You may select a catalogue ID only when the item in the photo is an exact, high-confidence match to one product in the selling store's own catalogue.

APPROVED CATALOGUE:
${CATALOGUE}

Rules:
- Match the product and its brand/store together. A NEWME garment can only return a NEWME / NEW ME catalogue item; never cross-match another brand.
- Never infer an exact SKU from a generic garment, a category, colour alone, or a partial/blurred photo.
- If the store branding, product details, or image quality do not support an exact match, return productId null.
- Never invent an ID and never return a similar alternative.
- confidence is 0 to 1. A non-null productId requires confidence of at least 0.82.
Reply with JSON only, matching the response schema exactly.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    productId: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
  },
  required: ['productId', 'confidence'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY not configured' })

  const image = typeof req.body?.image === 'string' ? req.body.image : ''
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(image)
  if (!match || image.length > 5_500_000) {
    return res.status(400).json({ error: 'invalid_image' })
  }
  const [, mimeType, base64Data] = match

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Verify this item against the approved catalogue.' },
                { inline_data: { mime_type: mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 150,
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
          },
        }),
      }
    )
    if (!response.ok) return res.status(502).json({ error: 'vision_error' })

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return res.status(502).json({ error: 'empty_response' })
    const parsed = JSON.parse(text)
    const product = PRODUCTS.find((item) => item.id === parsed.productId)
    const exactMatch = product && parsed.confidence >= 0.82
    return res.status(200).json({ productId: exactMatch ? product.id : null })
  } catch {
    return res.status(500).json({ error: 'match_failed' })
  }
}
