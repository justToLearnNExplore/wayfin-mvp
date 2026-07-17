import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FLOORS } from '../data/stores.js'
import StoreCard from './StoreCard.jsx'

const floorVariants = {
  enter: (dir) => ({
    y: dir > 0 ? '55%' : '-55%',
    rotateX: dir > 0 ? -28 : 28,
    scale: 0.85,
    opacity: 0,
  }),
  center: { y: 0, rotateX: 0, scale: 1, opacity: 1 },
  exit: (dir) => ({
    y: dir > 0 ? '-55%' : '55%',
    rotateX: dir > 0 ? 28 : -28,
    scale: 0.85,
    opacity: 0,
  }),
}

export default function FloorExplorer({ onStoreTap }) {
  const [[index, direction], setFloor] = useState([0, 0])
  const floor = FLOORS[index]

  const go = (next) => {
    if (next < 0 || next >= FLOORS.length || next === index) return
    setFloor([next, next > index ? 1 : -1])
  }

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info
    if (offset.y < -70 || velocity.y < -400) go(index + 1) // drag up → floor above
    else if (offset.y > 70 || velocity.y > 400) go(index - 1) // drag down → floor below
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-obsidian text-ivory">
      {/* floor rail */}
      <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
        {[...FLOORS].map((f, i) => (
          <button
            key={f.id}
            onClick={() => go(i)}
            aria-label={`Go to ${f.label}`}
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold transition-colors cursor-pointer ${
              i === index
                ? 'border-champagne bg-champagne/20 text-champagne-soft'
                : 'border-ivory/15 text-ivory/40'
            }`}
          >
            {f.short}
          </button>
        ))}
      </div>

      <div className="h-full w-full" style={{ perspective: 1200 }}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={floor.id}
            custom={direction}
            variants={floorVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.65, ease: [0.25, 0.9, 0.3, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.16}
            onDragEnd={handleDragEnd}
            className="absolute inset-0 flex flex-col justify-center px-4 pb-6"
            style={{ transformOrigin: '50% 50%' }}
          >
            <p className="text-center text-[10px] font-semibold tracking-[0.42em] text-champagne-soft">
              ORION MALL · POPULAR NOW
            </p>
            <h2 className="font-display mt-2 text-center text-[38px] leading-none">
              {floor.label.replace(' Floor', '')}{' '}
              <em className="italic text-champagne-soft">Floor</em>
            </h2>

            <div className="mx-auto mt-7 grid w-full max-w-[360px] grid-cols-4 gap-2.5 pr-6">
              {floor.stores.map((store, i) => (
                <StoreCard key={`${floor.id}-${store.name}`} store={store} index={i} onTap={onStoreTap} />
              ))}
            </div>

            <p className="mt-7 text-center text-[11px] text-ivory/40">
              {index < FLOORS.length - 1 ? 'Drag up for the next floor' : 'Top of the mall'} · Tap a store to ask wayFin
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
