/**
 * @file Tests for waitlist signup notification.
 * Run: node --test src/services/waitlist/notify.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { notifySignup, buildBody } from './notify.js'

const ENTRY = {
  email: 'priya@example.com',
  name: 'Priya S',
  phone: '+91 98765 43210',
  comment: 'Phoenix Mall next please',
  source: 'chat',
}

test('does nothing when notification is not configured', async () => {
  assert.equal(await notifySignup(ENTRY, 1, {}), 'not-configured')
  assert.equal(await notifySignup(ENTRY, 1, { RESEND_API_KEY: 'k' }), 'not-configured')
  assert.equal(await notifySignup(ENTRY, 1, { WAITLIST_NOTIFY_EMAIL: 'a@b.co' }), 'not-configured')
})

test('a send failure is reported, never thrown', async () => {
  // A signup is already stored by the time we get here; throwing would fail
  // the request and lose a real lead over a missing ping.
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  try {
    const result = await notifySignup(ENTRY, 7, {
      RESEND_API_KEY: 'k',
      WAITLIST_NOTIFY_EMAIL: 'ops@example.com',
    })
    assert.equal(result, 'failed')
  } finally {
    globalThis.fetch = original
  }
})

test('an error status is reported as failed', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('nope', { status: 422 })
  try {
    const result = await notifySignup(ENTRY, 7, {
      RESEND_API_KEY: 'k',
      WAITLIST_NOTIFY_EMAIL: 'ops@example.com',
    })
    assert.equal(result, 'failed')
  } finally {
    globalThis.fetch = original
  }
})

test('sends to the configured address and replies to the signup', async () => {
  const original = globalThis.fetch
  /** @type {any} */
  let captured = null
  globalThis.fetch = async (_url, opts) => {
    captured = JSON.parse(/** @type {string} */ (opts.body))
    return new Response('{}', { status: 200 })
  }
  try {
    const result = await notifySignup(ENTRY, 42, {
      RESEND_API_KEY: 'k',
      WAITLIST_NOTIFY_EMAIL: 'ops@example.com',
    })
    assert.equal(result, 'sent')
    assert.deepEqual(captured.to, ['ops@example.com'])
    assert.equal(captured.reply_to, 'priya@example.com')
    assert.match(captured.subject, /#42/)
    assert.match(captured.subject, /Priya S/)
  } finally {
    globalThis.fetch = original
  }
})

test('the recipient is never hardcoded — it comes only from the env', async () => {
  // Guards the whole point of the rewrite: the old flow baked the address into
  // a component and shipped it in the client bundle.
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('./notify.js', import.meta.url), 'utf8')
  )
  assert.equal(/@gmail\.com/.test(source), false, 'no gmail address may appear in this file')
  assert.match(source, /WAITLIST_NOTIFY_EMAIL/)
})

test('the body carries every field, with dashes for blanks', () => {
  const body = buildBody({ email: 'a@b.co', name: '', phone: '', comment: '', source: 'chat' }, 3)
  assert.match(body, /#3/)
  assert.match(body, /Email : a@b\.co/)
  assert.match(body, /Name {2}: —/)
  assert.match(body, /Phone : —/)
})
