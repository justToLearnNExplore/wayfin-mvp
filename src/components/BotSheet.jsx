import { useState } from 'react'
import { motion } from 'framer-motion'
import BotChat from './BotChat.jsx'

export default function BotSheet({ onClose, onEnter, store, lastVisited, onRouteReady, onOpenRoute, mode = 'landing' }) {
  const [expanded, setExpanded] = useState(false)
  const landing = mode === 'landing'

  const slideProps = landing
    ? {
        initial: { y: '115%' },
        animate: { y: 0 },
        transition: { delay: 0.9, duration: 0.9, ease: [0.2, 0.9, 0.25, 1] },
      }
    : {}

  const height = expanded ? '78%' : landing ? '46%' : '58%'

  return (
    <motion.div
      layoutId="bot-shell"
      {...slideProps}
      animate={{ ...(slideProps.animate ?? {}), height }}
      transition={slideProps.transition ?? { duration: 0.45, ease: [0.2, 0.9, 0.25, 1] }}
      className="absolute left-2.5 right-2.5 bottom-2.5 z-20 flex min-h-0 flex-col gap-3 overflow-hidden rounded-[26px] border border-champagne/35 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, rgba(23,20,30,.94), rgba(13,11,18,.97))',
        height,
        maxHeight: 'calc(100dvh - max(12px, env(safe-area-inset-top)))',
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
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-ivory/15 text-ivory/60 cursor-pointer"
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
        onEnter={landing ? onEnter : undefined}
        onExpand={() => setExpanded(true)}
      />
    </motion.div>
  )
}
