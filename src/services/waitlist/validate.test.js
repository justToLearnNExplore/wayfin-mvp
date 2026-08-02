/**
 * @file Tests for waitlist entry validation.
 * Run: node --test src/services/waitlist/validate.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEntry, MAX_COMMENT } from './validate.js'

test('accepts a minimal signup with only an email', () => {
  const result = validateEntry({ email: 'someone@example.com' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.entry, {
    email: 'someone@example.com',
    name: '',
    phone: '',
    comment: '',
    source: 'app',
  })
})

test('normalises the email so it can be a dedupe key', () => {
  const a = validateEntry({ email: '  Someone@Example.COM ' })
  const b = validateEntry({ email: 'someone@example.com' })
  assert.equal(a.ok && b.ok && a.entry.email === b.entry.email, true)
})

test('rejects a missing or malformed email', () => {
  for (const email of ['', '   ', 'nope', 'no@domain', 'a b@c.com', '@example.com']) {
    const result = validateEntry({ email })
    assert.equal(result.ok, false, `expected "${email}" to be rejected`)
    assert.equal(result.field, 'email')
  }
})

test('collapses whitespace in the name', () => {
  const result = validateEntry({ email: 'a@b.co', name: '  Priya   S  ' })
  assert.equal(result.ok && result.entry.name, 'Priya S')
})

test('accepts common Indian phone formats', () => {
  for (const phone of ['9876543210', '+91 98765 43210', '+91-98765-43210']) {
    const result = validateEntry({ email: 'a@b.co', phone })
    assert.equal(result.ok, true, `expected "${phone}" to be accepted`)
  }
})

test('rejects a phone with an implausible digit count', () => {
  for (const phone of ['12345', '12345678901234567890']) {
    const result = validateEntry({ email: 'a@b.co', phone })
    assert.equal(result.ok, false, `expected "${phone}" to be rejected`)
  }
})

test('phone is genuinely optional', () => {
  const result = validateEntry({ email: 'a@b.co', phone: '   ' })
  assert.equal(result.ok && result.entry.phone, '')
})

test('preserves newlines in the comment but trims the ends', () => {
  const result = validateEntry({ email: 'a@b.co', comment: '  line one\nline two  ' })
  assert.equal(result.ok && result.entry.comment, 'line one\nline two')
})

test('caps the comment length', () => {
  const result = validateEntry({ email: 'a@b.co', comment: 'x'.repeat(MAX_COMMENT + 1) })
  assert.equal(result.ok, false)
  assert.equal(result.field, 'comment')
})

test('bounds the source so a caller cannot write an arbitrary string', () => {
  const result = validateEntry({ email: 'a@b.co', source: 'z'.repeat(200) })
  assert.equal(result.ok && result.entry.source.length, 32)
})

test('ignores unknown fields rather than storing them', () => {
  const result = validateEntry(
    /** @type {any} */ ({ email: 'a@b.co', isAdmin: true, note: 'injected' })
  )
  assert.equal(result.ok, true)
  assert.deepEqual(Object.keys(result.entry).sort(), ['comment', 'email', 'name', 'phone', 'source'])
})
