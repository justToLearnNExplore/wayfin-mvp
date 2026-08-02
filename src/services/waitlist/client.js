/**
 * @file Client for /api/waitlist.
 *
 * Returns a discriminated result rather than throwing, and — importantly —
 * never reports success it did not observe. A waitlist that shows a
 * thank-you screen over a dropped write is worse than one that admits the
 * failure: the visitor walks away believing they signed up, and the signup
 * does not exist.
 */

const REQUEST_TIMEOUT_MS = 10000

/**
 * @typedef {{status: 'joined', position: number, added: boolean}
 *   | {status: 'invalid', field: string, message: string}
 *   | {status: 'rate-limited'}
 *   | {status: 'unavailable'}
 *   | {status: 'error'}} WaitlistResult
 */

/**
 * Submit a signup.
 * @param {import('./validate.js').WaitlistInput} input
 * @returns {Promise<WaitlistResult>}
 */
export async function joinWaitlist(input) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    if (res.status === 503) return { status: 'unavailable' }
    if (res.status === 429) return { status: 'rate-limited' }

    if (res.status === 400) {
      const data = await res.json().catch(() => ({}))
      return {
        status: 'invalid',
        field: data.field ?? 'email',
        message: data.message ?? 'Please check your details.',
      }
    }

    if (!res.ok) return { status: 'error' }

    const data = await res.json()
    return { status: 'joined', position: Number(data.position) || 0, added: data.added !== false }
  } catch {
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
  }
}
