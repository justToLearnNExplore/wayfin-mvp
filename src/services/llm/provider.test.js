/**
 * @file Tests for provider selection and schema translation.
 * Run: node --test src/services/llm/provider.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProvider, toGeminiSchema, parseDataUrl } from './provider.js'

// ---- provider selection ---------------------------------------------------

test('returns null when nothing is configured', () => {
  assert.equal(resolveProvider({}), null)
})

test('prefers OpenAI when both keys are present', () => {
  const p = resolveProvider({ OPENAI_API_KEY: 'sk-x', GEMINI_API_KEY: 'g-x' })
  assert.equal(p?.name, 'openai')
  assert.equal(p?.model, 'gpt-4o-mini')
})

test('falls back to Gemini when only Gemini is configured', () => {
  const p = resolveProvider({ GEMINI_API_KEY: 'g-x' })
  assert.equal(p?.name, 'gemini')
  assert.equal(p?.model, 'gemini-2.0-flash')
})

test('LLM_PROVIDER forces a choice', () => {
  const env = { OPENAI_API_KEY: 'sk-x', GEMINI_API_KEY: 'g-x', LLM_PROVIDER: 'gemini' }
  assert.equal(resolveProvider(env)?.name, 'gemini')
})

test('forcing a provider with no key yields null rather than silently switching', () => {
  // Silently using the other provider would hide a misconfiguration behind
  // a working app, and the operator would never find the dead key.
  assert.equal(resolveProvider({ OPENAI_API_KEY: 'sk-x', LLM_PROVIDER: 'gemini' }), null)
})

test('models are overridable without a code change', () => {
  const p = resolveProvider({ OPENAI_API_KEY: 'sk-x', OPENAI_TEXT_MODEL: 'gpt-4o' })
  assert.equal(p?.model, 'gpt-4o')
})

// ---- schema translation ---------------------------------------------------

test('uppercases types and converts nullable unions', () => {
  const gemini = toGeminiSchema({
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['navigate', 'unknown'] },
      origin: { type: ['string', 'null'] },
      confidence: { type: 'number' },
    },
    required: ['intent', 'origin', 'confidence'],
  })

  assert.equal(gemini.type, 'OBJECT')
  assert.equal(gemini.properties.intent.type, 'STRING')
  assert.deepEqual(gemini.properties.intent.enum, ['navigate', 'unknown'])
  assert.equal(gemini.properties.origin.type, 'STRING')
  assert.equal(gemini.properties.origin.nullable, true)
  assert.equal(gemini.properties.confidence.type, 'NUMBER')
  assert.deepEqual(gemini.required, ['intent', 'origin', 'confidence'])
})

test('a non-nullable field carries no nullable flag', () => {
  const gemini = toGeminiSchema({ type: 'object', properties: { a: { type: 'string' } } })
  assert.equal('nullable' in gemini.properties.a, false)
})

test('drops additionalProperties, which Gemini rejects', () => {
  const gemini = toGeminiSchema({
    type: 'object',
    additionalProperties: false,
    properties: { a: { type: 'string' } },
  })
  assert.equal('additionalProperties' in gemini, false)
})

test('recurses into arrays', () => {
  const gemini = toGeminiSchema({ type: 'array', items: { type: 'string' } })
  assert.equal(gemini.type, 'ARRAY')
  assert.equal(gemini.items.type, 'STRING')
})

// ---- data urls ------------------------------------------------------------

test('parses the image formats the endpoints accept', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const parsed = parseDataUrl(`data:${mime};base64,AAAA`)
    assert.equal(parsed?.mimeType, mime)
    assert.equal(parsed?.base64, 'AAAA')
  }
})

test('rejects anything that is not an inline image', () => {
  for (const bad of ['', 'https://example.com/a.jpg', 'data:text/html;base64,AAAA', 'data:image/gif;base64,AAAA']) {
    assert.equal(parseDataUrl(bad), null, `expected "${bad}" to be rejected`)
  }
})
