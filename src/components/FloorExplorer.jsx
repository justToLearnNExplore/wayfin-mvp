import { useEffect, useState } from 'react'
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

/**
 * How many cards the 4-column grid can show without overflowing a phone.
 *
 * The official map data brought some floors to 38 stores; at four across that
 * is ten rows, which ran off the bottom of the screen with nothing to scroll —
 * the last two rows were literally untappable. Scrolling cannot be the answer
 * here because the drag-to-change-floor gesture lives on this same element and
 * the two would fight. So the explorer stays a browsing surface and hands the
 * long tail to the searchable destination screen, which exists for exactly
 * that and does it better.
 */
const CARDS_PER_FLOOR = 16

/** Offers first — this grid is captioned "popular now", so lead with the deals. */
const featured = (stores) =>
  [...stores]
    .sort((a, b) => (b.discount ?? -1) - (a.discount ?? -1))
    .slice(0, CARDS_PER_FLOOR)

export default function FloorExplorer({ onStoreTap, onFloorChange, onSeeAll }) {
  const [[index, direction], setFloor] = useState([0, 0])
  const floor = FLOORS[index]

  // Report the visible floor upward so the app bar can label it. Effect rather
  // than a call inside `go`, so the very first floor is announced too.
  useEffect(() => {
    onFloorChange?.(floor)
  }, [floor, onFloorChange])

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
      {/* Floor rail, stacked like the building: 3rd at the top, Ground at the
          bottom. Reversed in CSS rather than by reversing the array, so the
          index handed to go() stays the true floor index and cannot drift.
          This also matches the rail on the route map, which was already
          building-order. */}
      <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col-reverse gap-1.5">
        {[...FLOORS].map((f, i) => (
          <button
            key={f.id}
            onClick={() => go(i)}
            aria-label={`Go to ${f.label}`}
            // 44x44 tap area with the pill drawn inside it. Apple's minimum
            // is 44pt and these sit near the screen edge where thumbs are
            // least accurate; growing the visible circle to match would make
            // the rail dominate a map it is only meant to annotate.
            className="flex h-11 w-11 items-center justify-center cursor-pointer"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
                i === index
                  ? 'border-champagne bg-champagne/20 text-champagne-soft'
                  : 'border-ivory/15 text-ivory/40'
              }`}
            >
              {f.short}
            </span>
          </button>
        ))}
      </div>

      {/* The drag gesture lives on this wrapper, NOT on the animated floor.
          They used to be the same element, and framer-motion would not finish
          the exit animation on a child that was also a drag target — so every
          floor you left stayed mounted at opacity 0. Five switches left five
          panels and 73 store cards in the DOM, invisible but still present
          and still hit-testable. Separating the two lets exit complete and
          the panel actually unmount, while the gesture behaves identically
          because this wrapper fills the same box. */}
      <motion.div
        className="h-full w-full"
        style={{ perspective: 1200 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.16}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={floor.id}
            custom={direction}
            variants={floorVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.65, ease: [0.25, 0.9, 0.3, 1] }}
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

            {/* Right padding clears the floor rail. The rail grew from a 32px pill
                to a 44px tap target, and this was still sized for the old one —
                cards in the last column ran underneath it. */}
            <div className="mx-auto mt-7 grid w-full max-w-[360px] grid-cols-4 gap-2.5 pr-14">
              {featured(floor.stores).map((store, i) => (
                <StoreCard key={`${floor.id}-${store.name}`} store={store} index={i} onTap={onStoreTap} />
              ))}
            </div>

            {floor.stores.length > CARDS_PER_FLOOR && onSeeAll && (
              <button
                onClick={() => onSeeAll(floor.id)}
                className="mx-auto mt-4 flex min-h-11 items-center gap-1.5 rounded-full border border-champagne/45 bg-champagne/8 px-5 text-[12px] font-bold text-champagne-soft cursor-pointer active:bg-champagne/20"
              >
                See all {floor.stores.length} on this floor
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            )}

            <p className="mt-5 text-center text-[11px] text-ivory/40">
              Tap any store to get directions to it
              <br />
              {index < FLOORS.length - 1 ? 'Swipe up for the next floor' : 'Top of the mall'}
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
