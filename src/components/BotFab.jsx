import { motion } from 'framer-motion'

export default function BotFab({ onOpen }) {
  return (
    <motion.button
      layoutId="bot-shell"
      onClick={onOpen}
      aria-label="Open wayFin assistant"
      className="fixed bottom-5 right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full border border-champagne/50 cursor-pointer"
      style={{
        background: 'linear-gradient(180deg, rgba(23,20,30,.95), rgba(13,11,18,.98))',
        boxShadow: '0 6px 30px rgba(201,162,39,.25)',
      }}
      whileTap={{ scale: 0.92 }}
    >
      <motion.div
        className="h-8 w-8"
        style={{
          background: 'conic-gradient(from 210deg, #7C5CFF, #E84A8A, #F2A03D, #38C7D8, #7C5CFF)',
          clipPath: 'polygon(50% 0, 100% 28%, 88% 100%, 12% 100%, 0 28%)',
          borderRadius: 9,
        }}
        animate={{ rotate: [0, 6, -6, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
    </motion.button>
  )
}
