// Vercel serverless function: /api/waitlist
//
// Stores a waitlist signup in Upstash Redis (what "Vercel KV" provisions) and
// returns the signer's position in the queue.
//
// This is the only endpoint in the app that ACCEPTS user data rather than
// answering a question about the mall, so it is the only one with a real
// abuse surface. Three defences, in order of cost:
//
//   1. Shape validation, shared with the form (../src/services/waitlist/validate.js).
//      The form's copy is a courtesy; this one decides.
//   2. Per-IP rate limit in Redis — a public write endpoint with no limit is
//      an invitation to fill someone else's database.
//   3. Dedupe by email, so a double-tap or a refresh cannot create two rows
//      and cannot inflate the position count.
//
// Credentials live only in the server env. Nothing here is bundled into the PWA.

import { validateEntry } from '../src/services/waitlist/validate.js'
import { notifySignup } from '../src/services/waitlist/notify.js'

/** Signups permitted from one IP per window. */
const RATE_LIMIT = 5
const RATE_WINDOW_SECONDS = 3600

const ENTRIES_KEY = 'waitlist:entries'
const EMAILS_KEY = 'waitlist:emails'

/**
 * Resolve Redis credentials.
 *
 * Two naming schemes because Vercel moved KV to the Upstash marketplace
 * integration partway through its life, and the two hand out different
 * variable names. Accepting both means the same code works whether the store
 * was added before or after that change.
 */
function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

/**
 * Run Redis commands through the Upstash REST pipeline.
 * @param {{url: string, token: string}} config
 * @param {(string | number)[][]} commands
 * @returns {Promise<any[]>} one result per command, in order.
 */
async function redis(config, commands) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!response.ok) throw new Error(`redis_${response.status}`)
  const data = await response.json()
  return data.map((/** @type {any} */ row) => row.result)
}

/** Best-effort client IP. Vercel sets x-forwarded-for; the first hop is the client. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return (raw || '').split(',')[0].trim() || 'unknown'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const config = redisConfig()
  // Reported honestly so the form can tell the user their signup did NOT
  // land, rather than showing a thank-you screen over a dropped write.
  if (!config) return res.status(503).json({ error: 'waitlist_unavailable' })

  const result = validateEntry(req.body ?? {})
  if (!result.ok) return res.status(400).json({ error: 'invalid', field: result.field, message: result.error })
  const { entry } = result

  try {
    // Rate limit first: INCR returns the new count, and EXPIRE is only armed
    // on the first hit so the window slides forward from the first request
    // rather than being extended indefinitely by continued attempts.
    const rateKey = `waitlist:rate:${clientIp(req)}`
    const [hits] = await redis(config, [['INCR', rateKey]])
    if (hits === 1) await redis(config, [['EXPIRE', rateKey, RATE_WINDOW_SECONDS]])
    if (hits > RATE_LIMIT) return res.status(429).json({ error: 'rate_limited' })

    // SADD returns 1 when the email is new, 0 when it was already a member —
    // which is exactly the "have we seen you before" check, in one round trip.
    const [isNew] = await redis(config, [['SADD', EMAILS_KEY, entry.email]])

    if (isNew === 1) {
      await redis(config, [
        ['LPUSH', ENTRIES_KEY, JSON.stringify({ ...entry, at: new Date().toISOString() })],
      ])
    }

    const [total] = await redis(config, [['SCARD', EMAILS_KEY]])
    const position = Number(total) || 1

    // Only ping the operator for genuinely new people — a refresh or a
    // double-tap should not send a second email about the same lead.
    //
    // Awaited rather than fired and forgotten: a serverless function is frozen
    // the moment it responds, so an un-awaited promise would simply be killed.
    // notifySignup swallows its own errors and is time-boxed, so this can
    // neither fail nor meaningfully delay a signup that is already stored.
    const notified = isNew === 1 ? await notifySignup(entry, position) : 'skipped'

    return res.status(200).json({
      ok: true,
      // False on a repeat signup, so the UI can say "you're already on the
      // list" instead of implying a second place was taken.
      added: isNew === 1,
      position,
      // Reported so the operator can tell a working notification from a
      // silently unconfigured one. Without this a 200 looks identical whether
      // the email went out or RESEND_API_KEY was never set, and the only way
      // to find out is to go and stare at an inbox.
      notified,
    })
  } catch {
    return res.status(502).json({ error: 'store_failed' })
  }
}
