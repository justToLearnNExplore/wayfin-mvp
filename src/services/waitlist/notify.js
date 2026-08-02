/**
 * @file Tell the operator a signup arrived.
 *
 * Sends through Resend, chosen because its free tier (3,000/month) needs no
 * card and — crucially — no DNS setup: with no verified domain it will still
 * deliver to the address that owns the Resend account, which is exactly the
 * one-recipient case here.
 *
 * THE RECIPIENT IS AN ENV VAR, NOT A CONSTANT. The previous rating flow
 * hardcoded the operator's address into a component, so it shipped inside the
 * client bundle where any visitor could read it and any scraper could harvest
 * it. Keeping it in WAITLIST_NOTIFY_EMAIL means the address exists only in the
 * server environment: not in the repo, not in git history, not in the bundle.
 * The test below enforces that no address is written back into this file.
 *
 * NOTIFICATION FAILURE MUST NEVER FAIL A SIGNUP. The row is already safely in
 * Redis by the time this runs. Losing the email costs the operator a ping they
 * can recover by reading the list; failing the request would cost a real lead
 * who thinks the waitlist is broken. So every error here is swallowed and
 * reported back as a boolean, never thrown.
 */

/** Resend's shared sender, usable without verifying a domain. */
const DEFAULT_FROM = 'wayFin <onboarding@resend.dev>'

/** Kept short: the signup is already stored, so this must not stall the reply. */
const TIMEOUT_MS = 4000

/**
 * @typedef {'sent' | 'not-configured' | 'failed'} NotifyResult
 */

/**
 * Email the operator about a new waitlist signup.
 *
 * @param {import('./validate.js').WaitlistEntry} entry
 * @param {number} position
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<NotifyResult>}
 */
export async function notifySignup(entry, position, env = process.env) {
  const key = env.RESEND_API_KEY
  const to = env.WAITLIST_NOTIFY_EMAIL
  if (!key || !to) return 'not-configured'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.WAITLIST_NOTIFY_FROM || DEFAULT_FROM,
        to: [to],
        // Reply goes straight to the person who signed up, so the operator can
        // answer a lead from their inbox without copying the address out.
        reply_to: entry.email,
        subject: `wayFin waitlist #${position} — ${entry.name || entry.email}`,
        text: buildBody(entry, position),
      }),
      signal: controller.signal,
    })
    return response.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Plain text, deliberately. It renders identically everywhere, cannot trip a
 * spam filter on markup, and the operator is reading five lines on a phone.
 *
 * @param {import('./validate.js').WaitlistEntry} entry
 * @param {number} position
 * @returns {string}
 */
export function buildBody(entry, position) {
  return [
    `New wayFin waitlist signup — #${position}`,
    '',
    `Email : ${entry.email}`,
    `Name  : ${entry.name || '—'}`,
    `Phone : ${entry.phone || '—'}`,
    `Wants : ${entry.comment || '—'}`,
    `From  : ${entry.source}`,
    '',
    'Reply to this email to reach them directly.',
  ].join('\n')
}
