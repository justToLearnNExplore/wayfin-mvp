import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { trackEvent } from '../lib/analytics.js'

const RATED_KEY = 'wayfin_rated'

const STAR_LABELS = ['Not great', 'Okay', 'Good', 'Great', 'Loved it']

// All submissions land here — a plain mailto: link, so no email API key or
// backend is needed. The submitter's own mail client sends it.
const FOUNDER_EMAIL = 'wayfin.app@gmail.com'

const buildMailLink = ({ rating, name, email, phone, comment }) => {
  const lines = [
    `Rating: ${'⭐'.repeat(rating)} (${rating}/5)`,
    `Name: ${name.trim() || 'not given'}`,
    `Email: ${email.trim() || 'not given'}`,
    `Phone: ${phone.trim() || 'not given'}`,
  ]
  if (comment.trim()) lines.push(`Comment: ${comment.trim()}`)
  const subject = `wayFin rating — ${rating}/5 from ${name.trim() || 'a visitor'}`
  return `mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}

// Full-screen rating + lead-capture sheet. Submissions are sent as a Vercel
// Analytics custom event ('rating_submitted') — visible in the project's
// Analytics → Events tab, filterable by property — AND opened as a mailto:
// deep link so the submitter's own mail app sends the details straight to
// wayfin.app@gmail.com with one tap. No new API key, no backend.
export default function RateSheet({ onClose }) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!rating) return
    trackEvent('rating_submitted', {
      rating,
      name: name.trim() || 'not given',
      email: email.trim() || 'not given',
      phone: phone.trim() || 'not given',
      hasComment: comment.trim().length > 0,
    })
    try {
      localStorage.setItem(RATED_KEY, '1')
    } catch {}
    // mailto: hands off to the OS mail app in-place; window.open tends to
    // leave a stray blank tab behind for mailto specifically.
    window.location.href = buildMailLink({ rating, name, email, phone, comment })
    setSubmitted(true)
  }

  const shownRating = hoverRating || rating

  return createPortal(
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-label="Rate wayFin"
      className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-y-auto bg-obsidian text-ivory"
    >
      <header className="flex items-center justify-between px-5 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div>
          <h2 className="font-display text-[21px]">Rate wayFin</h2>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-champagne-soft">
            HELP US GET BETTER
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close rating"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/20 text-ivory/75 cursor-pointer active:bg-ivory/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {submitted ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div
            className="h-14 w-14"
            style={{
              background: 'conic-gradient(from 210deg,#7C5CFF,#E84A8A,#F2A03D,#38C7D8,#7C5CFF)',
              clipPath: 'polygon(50% 0,100% 28%,88% 100%,12% 100%,0 28%)',
              borderRadius: 14,
            }}
          />
          <h3 className="font-display mt-5 text-[24px]">Thank you ✨</h3>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-ivory/65">
            Your feedback helps us bring wayFin to more malls.
          </p>
          <a
            href={buildMailLink({ rating, name, email, phone, comment })}
            className="mt-5 text-[11px] font-semibold text-ivory/40 underline decoration-ivory/25 underline-offset-2"
          >
            Mail app didn't open? Tap to send
          </a>
          <p className="mt-2 text-[10px] text-ivory/30">or reach us directly at {FOUNDER_EMAIL}</p>
          <button
            onClick={onClose}
            className="mt-5 flex min-h-12 items-center justify-center rounded-2xl border border-champagne/60 bg-champagne/15 px-8 text-[13px] font-extrabold text-champagne-soft cursor-pointer active:bg-champagne/30"
          >
            Back to wayFin
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <p className="text-center text-[13px] leading-relaxed text-ivory/65">
            How was finding your way around Orion Mall today?
          </p>

          <div className="mt-6 flex justify-center gap-2.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} out of 5 stars`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-champagne/30 bg-champagne/5 cursor-pointer transition-colors active:bg-champagne/20"
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill={n <= shownRating ? '#D8B65C' : 'none'}
                  stroke="#D8B65C"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M12 2l2.9 6.26 6.9.6-5.2 4.6 1.6 6.79L12 16.9l-6.2 3.35 1.6-6.79-5.2-4.6 6.9-.6L12 2z" />
                </svg>
              </button>
            ))}
          </div>
          <p className="mt-2 h-4 text-center text-[11px] font-semibold text-champagne-soft">
            {shownRating ? STAR_LABELS[shownRating - 1] : ''}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ivory/60">
                Name
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
                Email <span className="font-normal text-ivory/35">(so we can follow up)</span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
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
                Anything we should fix? <span className="font-normal text-ivory/35">(optional)</span>
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Tell us what worked, or what didn't…"
                className="w-full resize-none rounded-xl border border-ivory/15 bg-ivory/5 px-4 py-3 text-[14px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!rating}
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-champagne/70 bg-champagne/15 px-4 text-[13px] font-extrabold text-champagne-soft transition-colors cursor-pointer active:bg-champagne/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit rating
          </button>
          {!rating && (
            <p className="mt-2 text-center text-[11px] text-ivory/40">Tap a star to rate wayFin.</p>
          )}
        </form>
      )}
    </motion.section>,
    document.body
  )
}
