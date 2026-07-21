import { motion } from 'framer-motion'
import FacetWalker from './FacetWalker.jsx'
import BotSheet from './BotSheet.jsx'

const STARS = [
  { top: '8%', left: '12%', d: 0 },
  { top: '15%', left: '78%', d: 1 },
  { top: '30%', left: '88%', d: 2 },
  { top: '44%', left: '6%', d: 0.5 },
  { top: '25%', left: '30%', d: 1.6 },
  { top: '38%', left: '60%', d: 2.4 },
]

const rise = (delay) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] },
})

export default function Landing({ onEnter, onRouteReady, onOpenRoute }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-obsidian text-ivory">
      {/* constellation */}
      {STARS.map((s, i) => (
        <motion.i
          key={i}
          className="absolute h-0.5 w-0.5 rounded-full bg-champagne"
          style={{ top: s.top, left: s.left }}
          animate={{ opacity: [0.15, 0.5, 0.15] }}
          transition={{ repeat: Infinity, duration: 4, delay: s.d }}
        />
      ))}

      {/* atrium ring — outer div positions, inner motion animates */}
      <div className="absolute left-1/2 top-[10%] -translate-x-1/2">
        <motion.div
          className="rounded-full border border-champagne/50"
          style={{ width: 'min(300px, 78vw, 42dvh)', height: 'min(300px, 78vw, 42dvh)' }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="absolute inset-[22px] rounded-full border border-dashed border-champagne/25" />
        </motion.div>
      </div>

      <motion.p
        {...rise(0.2)}
        className="absolute top-[6%] w-full text-center text-[10px] font-semibold tracking-[0.42em] text-champagne-soft"
      >
        ORION MALL · BRIGADE GATEWAY
      </motion.p>

      <motion.h1
        {...rise(0.35)}
        className="font-display absolute top-[12%] w-full text-center font-[390] leading-none tracking-tight"
        style={{ fontSize: 'clamp(44px, 15vw, 64px)' }}
      >
        way<em className="italic text-champagne-soft">Fin</em>
      </motion.h1>

      <motion.p
        {...rise(0.5)}
        className="absolute top-[23%] z-10 w-full text-center text-[13px] text-ivory/65"
        style={{ textShadow: '0 2px 12px rgba(11,10,15,.95), 0 0 4px rgba(11,10,15,.9)' }}
      >
        The mall, already figured out.
      </motion.p>

      {/* walker sits center-right, anchored above the chat sheet so it never clips */}
      <div className="absolute left-[54%] -translate-x-1/2" style={{ bottom: 'calc(46% + 14px)' }}>
        <motion.div {...rise(0.55)}>
          <FacetWalker />
        </motion.div>
      </div>

      {/* dotted route under the walker's feet */}
      <div className="absolute w-full text-center" style={{ bottom: 'calc(46% + 4px)' }}>
        <svg width="330" height="46" viewBox="0 0 330 46" className="max-w-[92%] overflow-visible">
          <motion.path
            d="M30,38 C110,10 200,44 290,16"
            fill="none"
            stroke="#C9A227"
            strokeWidth="1.4"
            strokeDasharray="2 7"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.65 }}
            transition={{ delay: 1, duration: 2.2, ease: 'easeOut' }}
          />
          <motion.g {...rise(2.2)}>
            <circle cx="290" cy="16" r="4.5" fill="#C9A227" />
            <circle cx="290" cy="16" r="9" fill="none" stroke="#C9A227" strokeOpacity="0.4" />
          </motion.g>
        </svg>
      </div>

      <BotSheet mode="landing" onEnter={onEnter} onRouteReady={onRouteReady} onOpenRoute={onOpenRoute} />
    </div>
  )
}
