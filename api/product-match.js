// Vercel serverless function: /api/product-match
// The model can only select one identifier from the mall store catalogue. It
// never supplies prices, sizes, links, or a visually-similar alternative.
//
// Note: the current UI (src/services/productMatcher.js) intentionally does
// NOT call this endpoint — the live demo uses a deterministic local stub so
// the price-match flow can never fail on stage. This route is kept ready for
// when the team wants to flip on live multi-SKU vision matching.
//
// Provider-agnostic: runs on whichever LLM key is configured.

import { PRODUCTS } from '../src/data/products.js'
import { resolveProvider, generateJson, parseDataUrl, LlmError } from '../src/services/llm/provider.js'

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
  type: 'object',
  additionalProperties: false,
  properties: {
    productId: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: ['productId', 'confidence'],
}

/** A non-null match must clear this before we will show it as the same item. */
const MATCH_CONFIDENCE = 0.82

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const provider = resolveProvider()
  if (!provider) return res.status(503).json({ error: 'llm_not_configured' })

  const image = typeof req.body?.image === 'string' ? req.body.image : ''
  if (!parseDataUrl(image) || image.length > 5_500_000) {
    return res.status(400).json({ error: 'invalid_image' })
  }

  try {
    const parsed = await generateJson({
      provider,
      instructions: INSTRUCTIONS,
      userText: 'Verify this item against the approved catalogue.',
      image,
      schema: SCHEMA,
      schemaName: 'wayfin_product_match',
      maxTokens: 150,
    })

    // ---- validation boundary -------------------------------------------
    // The id must exist in OUR catalogue. A hallucinated id is discarded
    // rather than surfaced as a match.
    const product = PRODUCTS.find((item) => item.id === parsed.productId)
    const exactMatch = product && parsed.confidence >= MATCH_CONFIDENCE
    return res.status(200).json({ productId: exactMatch ? product.id : null })
  } catch (err) {
    if (err instanceof LlmError) {
      return res.status(502).json({ error: `llm_${err.kind}`, detail: err.detail })
    }
    return res.status(500).json({ error: 'match_failed' })
  }
}
