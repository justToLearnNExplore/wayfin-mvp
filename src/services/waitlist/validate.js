/**
 * @file Waitlist entry validation — the single definition of a valid signup.
 *
 * Imported by BOTH the form and `/api/waitlist`. The client copy exists to
 * give instant feedback; the server copy is the one that actually decides,
 * because anything arriving at a public endpoint is untrusted no matter what
 * the form believed. Sharing the module means the two can never drift into
 * disagreeing about what a valid email is.
 *
 * Everything here is pure, so the rules are unit-tested without a browser or
 * a running function.
 */

/** Longest address permitted by RFC 5321. */
export const MAX_EMAIL = 254
export const MAX_NAME = 80
export const MAX_PHONE = 20
export const MAX_COMMENT = 500

/**
 * Pragmatic email shape check.
 *
 * Deliberately not a full RFC 5322 parser: those accept addresses no mail
 * provider will deliver to and reject ones that work. This catches typos and
 * junk, and real delivery is proven later by actually sending to it.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Digits after stripping formatting — Indian mobiles are 10, +country up to 15. */
const MIN_PHONE_DIGITS = 7
const MAX_PHONE_DIGITS = 15

/**
 * @typedef {Object} WaitlistInput
 * @property {string} [email]
 * @property {string} [name]
 * @property {string} [phone]
 * @property {string} [comment]
 * @property {string} [source] Where the signup came from, e.g. 'chat'.
 */

/**
 * @typedef {Object} WaitlistEntry
 * @property {string} email    Trimmed and lowercased — the dedupe key.
 * @property {string} name     '' when not given.
 * @property {string} phone    '' when not given.
 * @property {string} comment  '' when not given.
 * @property {string} source
 */

/**
 * @typedef {{ok: true, entry: WaitlistEntry}
 *   | {ok: false, field: 'email'|'name'|'phone'|'comment', error: string}} ValidationResult
 */

/** Collapse runs of whitespace and trim. */
const tidy = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

/**
 * Validate and normalise a signup.
 *
 * Errors are phrased as sentences a person can act on, because they are shown
 * directly in the form rather than being translated by the caller.
 *
 * @param {WaitlistInput} input
 * @returns {ValidationResult}
 */
export function validateEntry(input = {}) {
  const email = tidy(input.email).toLowerCase()
  if (!email) return { ok: false, field: 'email', error: 'We need an email to reach you.' }
  if (email.length > MAX_EMAIL) return { ok: false, field: 'email', error: 'That email is too long.' }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, field: 'email', error: "That doesn't look like an email address." }
  }

  const name = tidy(input.name)
  if (name.length > MAX_NAME) return { ok: false, field: 'name', error: 'That name is too long.' }

  const phone = tidy(input.phone)
  if (phone) {
    if (phone.length > MAX_PHONE) return { ok: false, field: 'phone', error: 'That number is too long.' }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
      return { ok: false, field: 'phone', error: "That doesn't look like a phone number." }
    }
  }

  // Not tidied with `tidy`: newlines are meaningful in free text, so only the
  // ends are trimmed.
  const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  if (comment.length > MAX_COMMENT) {
    return { ok: false, field: 'comment', error: `Please keep it under ${MAX_COMMENT} characters.` }
  }

  const source = tidy(input.source).slice(0, 32) || 'app'

  return { ok: true, entry: { email, name, phone, comment, source } }
}
