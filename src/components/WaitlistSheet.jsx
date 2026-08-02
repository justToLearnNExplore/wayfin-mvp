import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { trackEvent } from '../lib/analytics.js'
import { validateEntry } from '../services/waitlist/validate.js'
import { joinWaitlist } from '../services/waitlist/client.js'

export const JOINED_KEY = 'wayfin_waitlisted'

/**
 * Waitlist signup, replacing the old star-rating + Gmail-compose sheet.
 *
 * Two things changed, both deliberate:
 *
 * ASK, NOT AUDIT. "Rate wayFin" asks a visitor to grade a demo they used
 * once, which produces a number nobody can act on. "Join the waitlist" asks
 * whether they want this to exist in their mall — a far more useful signal,
 * and one that leaves behind a contactable person rather than a star count.
 *
 * THE SUBMISSION LANDS SOMEWHERE. The old flow opened a pre-filled Gmail tab
 * and trusted the visitor to press send, which most never did. This posts to
 * /api/waitlist and reports what actually happened, including failure — a
 * thank-you screen over a dropped write is worse than an honest error.
 */
export default function WaitlistSheet({ onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [joined, setJoined] = useState(/** @type {{position: number, added: boolean} | null} */ (null))

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return

    // Validated with the same module the server uses, so the inline error the
    // visitor sees is the same rule that will actually be applied.
    const check = validateEntry({ name, email, phone, comment, source: 'chat' })
    if (!check.ok) return setError(check.error)

    setError(null)
    setBusy(true)
    const result = await joinWaitlist(check.entry)
    setBusy(false)

    if (result.status === 'joined') {
      trackEvent('waitlist_joined', { position: result.position, hasPhone: !!check.entry.phone })
      try {
        localStorage.setItem(JOINED_KEY, '1')
      } catch {}
      setJoined({ position: result.position, added: result.added })
      return
    }

    trackEvent('waitlist_failed', { reason: result.status })
    setError(
      result.status === 'invalid'
        ? result.message
        : result.status === 'rate-limited'
          ? 'Too many signups from here just now. Try again in a bit.'
          : result.status === 'unavailable'
            ? "The waitlist isn't accepting signups yet. Do try again soon."
            : "Couldn't reach the waitlist. Check your connection and try again."
    )
  }

  return createPortal(
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-label="Join the wayFin waitlist"
      className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-y-auto bg-obsidian text-ivory"
    >
      <header className="flex items-center justify-between px-5 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div>
          <h2 className="font-display text-[21px]">Join the waitlist</h2>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-champagne-soft">
            BE FIRST WHEN WE LAUNCH
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close waitlist"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/20 text-ivory/75 cursor-pointer active:bg-ivory/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {joined ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div
            className="h-14 w-14"
            style={{
              background: 'conic-gradient(from 210deg,#7C5CFF,#E84A8A,#F2A03D,#38C7D8,#7C5CFF)',
              clipPath: 'polygon(50% 0,100% 28%,88% 100%,12% 100%,0 28%)',
              borderRadius: 14,
            }}
          />
          <h3 className="font-display mt-5 text-[24px]">
            {joined.added ? "You're in ✨" : 'Already on the list ✨'}
          </h3>

          {joined.position > 0 && (
            <p className="font-display mt-4 text-[40px] leading-none text-champagne-soft">
              #{joined.position}
            </p>
          )}
          <p className="mt-2 text-[11px] font-semibold tracking-[0.16em] text-ivory/45">
            {joined.added ? 'YOUR SPOT' : 'YOUR SPOT — UNCHANGED'}
          </p>

          <p className="mt-5 max-w-[290px] text-[13px] leading-relaxed text-ivory/65">
            We'll email you the moment wayFin goes live at a mall near you.
          </p>
          <button
            onClick={onClose}
            className="mt-6 flex min-h-12 items-center justify-center rounded-2xl border border-champagne/60 bg-champagne/15 px-8 text-[13px] font-extrabold text-champagne-soft cursor-pointer active:bg-champagne/30"
          >
            Back to wayFin
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6"
        >
          <p className="text-center text-[13px] leading-relaxed text-ivory/65">
            wayFin is live at Orion Mall as a preview. Leave your email and we'll
            tell you when it lands properly — and in your mall.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ivory/60">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
                placeholder="you@example.com"
                className="min-h-12 w-full rounded-xl border border-ivory/15 bg-ivory/5 px-4 text-[14px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ivory/60">
                Name <span className="font-normal text-ivory/35">(optional)</span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
                className="min-h-12 w-full rounded-xl border border-ivory/15 bg-ivory/5 px-4 text-[14px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ivory/60">
                Phone <span className="font-normal text-ivory/35">(optional)</span>
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                className="min-h-12 w-full rounded-xl border border-ivory/15 bg-ivory/5 px-4 text-[14px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ivory/60">
                Which mall should we do next?{' '}
                <span className="font-normal text-ivory/35">(optional)</span>
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Phoenix, Nexus, an airport terminal…"
                className="w-full resize-none rounded-xl border border-ivory/15 bg-ivory/5 px-4 py-3 text-[14px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-[#E84A8A]/40 bg-[#E84A8A]/10 px-4 py-2.5 text-[12px] text-ivory/85">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-champagne/70 bg-champagne/15 px-4 text-[13px] font-extrabold text-champagne-soft transition-colors cursor-pointer active:bg-champagne/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Joining…' : 'Join the waitlist'}
          </button>

          {/* Purpose notice. We are collecting contact details from members of
              the public, so what they are for is stated where they are given
              rather than buried in a policy page. */}
          <p className="mt-3 text-center text-[10.5px] leading-relaxed text-ivory/35">
            We'll only use this to tell you about wayFin. No sharing, no selling,
            and you can ask us to delete it any time.
          </p>
        </form>
      )}
    </motion.section>,
    document.body
  )
}
