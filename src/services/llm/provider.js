/**
 * @file One JSON-mode LLM call, against whichever provider has a working key.
 *
 * WHY THIS EXISTS. /api/intent and /api/product-match were written against
 * Gemini; /api/localize-vision against OpenAI. That was a deliberate cost
 * split — chat is the high-volume path and Gemini's free tier absorbs it —
 * but it means a dead or unfunded key at either provider silently disables
 * half the app, and the operator has to keep two billing relationships alive
 * to run one product.
 *
 * So provider choice becomes configuration rather than code. Whichever key is
 * present gets used, OpenAI first because that is the one most likely to be
 * funded; set LLM_PROVIDER to force a choice. Neither endpoint knows or cares
 * which one answered.
 *
 * WHAT THIS DOES NOT DO. It never decides anything about the mall. Callers
 * pass a closed catalogue in their instructions and re-validate every answer
 * against their own data, exactly as before. Swapping the model underneath
 * cannot widen what the model is allowed to say.
 */

/** @typedef {'openai' | 'gemini'} ProviderName */

/**
 * @typedef {Object} ResolvedProvider
 * @property {ProviderName} name
 * @property {string} key
 * @property {string} model
 */

/**
 * Pick a provider from the environment.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {ResolvedProvider | null} null when nothing is configured, which
 *   callers must report as 503 rather than fabricating a result.
 */
export function resolveProvider(env = process.env) {
  const forced = env.LLM_PROVIDER?.trim().toLowerCase()

  const openai = env.OPENAI_API_KEY
  const gemini = env.GEMINI_API_KEY

  const asOpenAI = () =>
    openai ? { name: /** @type {ProviderName} */ ('openai'), key: openai, model: env.OPENAI_TEXT_MODEL || 'gpt-4o-mini' } : null
  const asGemini = () =>
    gemini ? { name: /** @type {ProviderName} */ ('gemini'), key: gemini, model: env.GEMINI_MODEL || 'gemini-2.0-flash' } : null

  if (forced === 'openai') return asOpenAI()
  if (forced === 'gemini') return asGemini()

  // Unforced: prefer OpenAI. It is the key that also drives vision, so an
  // operator who has funded exactly one provider has almost certainly funded
  // that one.
  return asOpenAI() ?? asGemini()
}

/**
 * Convert a standard JSON Schema into Gemini's OpenAPI-subset dialect.
 *
 * The two differ in three ways that matter here: Gemini uppercases type
 * names, expresses optionality as a `nullable` flag rather than a
 * `['string','null']` union, and rejects `additionalProperties`.
 *
 * @param {any} schema
 * @returns {any}
 */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema

  const { type, properties, items, required, enum: enumValues, description } = schema

  /** @type {any} */
  const out = {}

  if (Array.isArray(type)) {
    const concrete = type.find((t) => t !== 'null')
    out.type = String(concrete ?? 'string').toUpperCase()
    if (type.includes('null')) out.nullable = true
  } else if (typeof type === 'string') {
    out.type = type.toUpperCase()
  }

  if (description) out.description = description
  if (enumValues) out.enum = enumValues
  if (required) out.required = required
  if (items) out.items = toGeminiSchema(items)

  if (properties) {
    out.properties = {}
    for (const [key, value] of Object.entries(properties)) {
      out.properties[key] = toGeminiSchema(value)
    }
  }

  return out
}

/** Thrown so callers can map a cause to the right HTTP status. */
export class LlmError extends Error {
  /**
   * @param {'upstream' | 'empty' | 'malformed'} kind
   * @param {string} [detail]
   */
  constructor(kind, detail = '') {
    super(`llm_${kind}${detail ? `: ${detail}` : ''}`)
    this.kind = kind
    this.detail = detail
  }
}

/**
 * Split a data URL into the parts each provider wants.
 * @param {string} dataUrl
 * @returns {{mimeType: string, base64: string} | null}
 */
export function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl ?? '')
  return match ? { mimeType: match[1], base64: match[2] } : null
}

/**
 * Ask the model for JSON matching a schema.
 *
 * @param {Object} params
 * @param {ResolvedProvider} params.provider
 * @param {string} params.instructions  System prompt.
 * @param {string} params.userText
 * @param {string} [params.image]       Data URL, for multimodal calls.
 * @param {any} params.schema           Standard JSON Schema.
 * @param {string} params.schemaName    Required by OpenAI structured outputs.
 * @param {number} [params.maxTokens]
 * @returns {Promise<any>} The parsed JSON object.
 * @throws {LlmError}
 */
export async function generateJson({
  provider,
  instructions,
  userText,
  image,
  schema,
  schemaName,
  maxTokens = 300,
}) {
  const text =
    provider.name === 'openai'
      ? await callOpenAI({ provider, instructions, userText, image, schema, schemaName, maxTokens })
      : await callGemini({ provider, instructions, userText, image, schema, maxTokens })

  if (!text) throw new LlmError('empty')

  try {
    return JSON.parse(text)
  } catch {
    throw new LlmError('malformed', text.slice(0, 200))
  }
}

/** @returns {Promise<string | undefined>} */
async function callOpenAI({ provider, instructions, userText, image, schema, schemaName, maxTokens }) {
  /** @type {any[]} */
  const content = [{ type: 'input_text', text: userText }]
  if (image) content.push({ type: 'input_image', image_url: image, detail: 'high' })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({
      model: provider.model,
      instructions,
      input: [{ role: 'user', content }],
      temperature: 0,
      max_output_tokens: maxTokens,
      text: {
        format: { type: 'json_schema', name: schemaName, schema, strict: true },
      },
    }),
  })

  if (!response.ok) throw new LlmError('upstream', (await response.text()).slice(0, 400))

  const data = await response.json()
  return (
    data.output_text ??
    data.output?.flatMap((/** @type {any} */ o) => o.content ?? []).find((/** @type {any} */ c) => c.type === 'output_text')?.text
  )
}

/** @returns {Promise<string | undefined>} */
async function callGemini({ provider, instructions, userText, image, schema, maxTokens }) {
  /** @type {any[]} */
  const parts = [{ text: userText }]
  if (image) {
    const parsed = parseDataUrl(image)
    if (!parsed) throw new LlmError('upstream', 'unparseable image data url')
    parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
        },
      }),
    }
  )

  if (!response.ok) throw new LlmError('upstream', (await response.text()).slice(0, 400))

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text
}
