import { useState } from 'react'
import { motion } from 'framer-motion'
import BotChat from './BotChat.jsx'

export default function BotSheet({ onClose, onEnter, store, lastVisited, onRouteReady, onOpenRoute, onAnchor, mode = 'landing' }) {
  const [expanded, setExpanded] = useState(false)
  const landing = mode === 'landing'
  // 'full' owns the whole screen: no splash art behind it, nothing to share
  // attention with. Users reported the old split screen — animation above,
  // chat below — as unclear and attention-stealing, and they were right: two
  // things asking to be looked at means neither gets read.
  const full = mode === 'full'

  const slideProps = landing
    ? {
        initial: { y: '115%' },
        animate: { y: 0 },
        transition: { delay: 0.9, duration: 0.9, ease: [0.2, 0.9, 0.25, 1] },
      }
    : {}

  // 72% on landing: a tile rather than a page, as asked, but tall enough to
  // read the options without scrolling. 46% cut them off.
  const height = full ? '100%' : expanded ? '88%' : landing ? '72%' : '58%'

  return (
    <motion.div
      layoutId="bot-shell"
      {...slideProps}
      animate={{ ...(slideProps.animate ?? {}), height }}
      transition={slideProps.transition ?? { duration: 0.45, ease: [0.2, 0.9, 0.25, 1] }}
      className={
        full
          ? 'absolute inset-0 z-20 flex min-h-0 flex-col gap-3 overflow-hidden p-5 pt-[max(1.25rem,var(--safe-top))] pb-[max(1.25rem,var(--safe-bottom))]'
          : 'absolute left-2.5 right-2.5 bottom-2.5 z-20 flex min-h-0 flex-col gap-3 overflow-hidden rounded-[26px] border border-champagne/35 p-5 pb-[max(1.25rem,var(--safe-bottom))] backdrop-blur-xl'
      }
      style={{
        // Theme tokens, not literals. This was a hardcoded dark gradient, so
        // in light mode the page went cream and the tile stayed black — with
        // near-black text on it. The single reason light mode looked broken.
        background: full
          ? 'var(--color-obsidian)'
          : 'linear-gradient(180deg, var(--color-obsidian-2), var(--color-obsidian))',
        height,
        maxHeight: full ? '100%' : 'calc(100dvh - max(12px, var(--safe-top)))',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 shrink-0"
          style={{
            background: 'conic-gradient(from 210deg, #7C5CFF, #E84A8A, #F2A03D, #38C7D8, #7C5CFF)',
            clipPath: 'polygon(50% 0, 100% 28%, 88% 100%, 12% 100%, 0 28%)',
            borderRadius: 11,
          }}
        />
        <div>
          <div className="font-display text-[17px] leading-tight">wayFin</div>
          <div className="text-[10.5px] font-semibold tracking-[0.18em] text-champagne-soft">
            ONLINE · ORION MALL
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Minimize wayFin"
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-full border border-ivory/15 text-ivory/60 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      <BotChat
        initialStore={store}
        lastVisited={lastVisited}
        onRouteReady={onRouteReady}
        onOpenRoute={onOpenRoute}
        onAnchor={onAnchor}
        // Both entry modes carry it; only the in-mall overlay drops it.
        onEnter={landing || full ? onEnter : undefined}
        onExpand={() => setExpanded(true)}
      />
    </motion.div>
  )
}
