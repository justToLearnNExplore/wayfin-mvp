// Vercel serverless function: /api/product-match
// The model can only select one identifier from the mall store catalogue. It
// never supplies prices, sizes, links, or a visually-similar alternative.

import { PRODUCTS } from '../src/data/products.js'

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
Reply with JSON only.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    productId: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: ['productId', 'confidence'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.OPENAI_API_KEY
  if (!key) return res.status(503).json({ error: 'OPENAI_API_KEY not configured' })

  const image = typeof req.body?.image === 'string' ? req.body.image : ''
  const isImageDataUrl = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)
  if (!isImageDataUrl || image.length > 5_500_000) {
    return res.status(400).json({ error: 'invalid_image' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        instructions: INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Verify this item against the approved catalogue.' },
              { type: 'input_image', image_url: image, detail: 'high' },
            ],
          },
        ],
        temperature: 0,
        max_output_tokens: 120,
        text: {
          format: { type: 'json_schema', name: 'product_match', schema: SCHEMA, strict: true },
        },
      }),
    })
    if (!response.ok) return res.status(502).json({ error: 'vision_error' })

    const data = await response.json()
    const output =
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')?.text
    const parsed = JSON.parse(output)
    const product = PRODUCTS.find((item) => item.id === parsed.productId)
    const exactMatch = product && parsed.confidence >= 0.82
    return res.status(200).json({ productId: exactMatch ? product.id : null })
  } catch {
    return res.status(500).json({ error: 'match_failed' })
  }
}
