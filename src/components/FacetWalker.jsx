import { motion } from 'framer-motion'

const FACETS = [
  // head
  { pts: '95,20 115,25 108,45', fill: '#F2A03D' },
  { pts: '95,20 108,45 88,42', fill: '#E84A8A' },
  { pts: '95,20 88,42 80,30', fill: '#7C5CFF' },
  // neck
  { pts: '98,45 108,45 103,56', fill: '#D8B65C' },
  // torso
  { pts: '85,60 115,55 105,100', fill: '#7C5CFF' },
  { pts: '85,60 105,100 80,105', fill: '#38C7D8' },
  { pts: '115,55 120,95 105,100', fill: '#E84A8A' },
  { pts: '80,105 105,100 95,140', fill: '#E84A8A' },
  { pts: '105,100 120,95 112,135', fill: '#F2A03D' },
  { pts: '95,140 105,100 112,135', fill: '#7C5CFF' },
  // back arm
  { pts: '88,62 96,63 84,95', fill: '#2A9DAB' },
  // front arm + bag
  { pts: '112,60 122,62 118,86', fill: '#F2A03D' },
  { pts: '118,86 126,84 124,110', fill: '#E84A8A' },
  { pts: '116,112 138,112 134,148', fill: '#C9A227' },
  { pts: '116,112 134,148 112,146', fill: '#8F741C' },
  // front leg
  { pts: '95,140 112,135 125,175', fill: '#38C7D8' },
  { pts: '118,168 128,172 136,206', fill: '#7C5CFF' },
  { pts: '128,200 148,207 130,213', fill: '#E84A8A' },
  // back leg
  { pts: '95,140 106,142 78,180', fill: '#E84A8A' },
  { pts: '78,180 88,182 70,216', fill: '#F2A03D' },
  { pts: '56,213 76,216 70,223', fill: '#38C7D8' },
]

export default function FacetWalker({ delay = 0.7, className = '' }) {
  return (
    <svg
      className={className}
      // scale with the viewport so legs never clip on short/narrow phones
      style={{ width: 'clamp(140px, 24dvh, 220px)', height: 'auto' }}
      viewBox="0 0 200 250"
      aria-label="Faceted figure walking with a shopping bag"
      role="img"
    >
      {FACETS.map((f, i) => (
        <motion.polygon
          key={i}
          points={f.pts}
          fill={f.fill}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.05, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        />
      ))}
    </svg>
  )
}
