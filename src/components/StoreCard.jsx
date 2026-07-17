import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Flip card: front = store name, back = discount reveal.
// Discount cards auto-flip once when the floor arrives, then flip back,
// leaving a gold dot so shoppers can still spot them. Tap opens wayFin.
export default function StoreCard({ store, index, onTap }) {
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!store.discount) return
    const reveal = setTimeout(() => setFlipped(true), 1100 + index * 150)
    const hide = setTimeout(() => setFlipped(false), 2900 + index * 150)
    return () => { clearTimeout(reveal); clearTimeout(hide) }
  }, [store.name, store.discount, index])

  return (
    <motion.button
      onTap={() => onTap(store)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.04, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      whileTap={{ scale: 0.93 }}
      className="relative aspect-square cursor-pointer"
      style={{ perspective: 600 }}
      aria-label={store.discount ? `${store.name}, ${store.discount} percent off` : store.name}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.65, ease: [0.3, 0.9, 0.3, 1] }}
      >
        {/* front */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl border border-champagne/30 bg-obsidian-2 p-1 text-center text-[10px] font-bold leading-tight text-ivory/90"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {store.name}
          {store.discount && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-champagne" />
          )}
        </div>
        {/* back */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-magenta/50 text-center"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'linear-gradient(160deg, rgba(124,92,255,.25), rgba(232,74,138,.3))',
          }}
        >
          <span className="font-display text-[20px] leading-none text-champagne-soft">
            {store.discount}%
          </span>
          <span className="mt-0.5 text-[8.5px] font-bold tracking-[0.25em] text-ivory/80">OFF</span>
        </div>
      </motion.div>
    </motion.button>
  )
}
