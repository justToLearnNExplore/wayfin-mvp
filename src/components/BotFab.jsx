import { motion } from 'framer-motion'

/**
 * The way back to the six options, from anywhere in the mall.
 *
 * It used to be a bare logo, which said nothing about what tapping it did — a
 * mystery icon in an app whose whole promise is that anyone can use it without
 * being taught. It carries the word "Menu" now: for the audience this is for,
 * a word beats a mark every time.
 *
 * The pentagon stays as the brand cue, but the label is what the button is.
 */
export default function BotFab({ onOpen }) {
  return (
    <motion.button
      layoutId="bot-shell"
      onClick={onOpen}
      aria-label="Open the menu"
      className="fixed bottom-5 right-4 z-50 flex min-h-14 items-center gap-2.5 rounded-full border border-champagne/50 pl-3.5 pr-5 cursor-pointer"
      style={{
        // Theme tokens, not literals — a hardcoded dark gradient here is what
        // left the chat tile black when the rest of the app went light.
        background: 'linear-gradient(180deg, var(--color-obsidian-2), var(--color-obsidian))',
        boxShadow: '0 6px 30px rgba(201,162,39,.25)',
      }}
      whileTap={{ scale: 0.94 }}
    >
      <motion.div
        className="h-7 w-7 flex-none"
        style={{
          background: 'conic-gradient(from 210deg, #7C5CFF, #E84A8A, #F2A03D, #38C7D8, #7C5CFF)',
          clipPath: 'polygon(50% 0, 100% 28%, 88% 100%, 12% 100%, 0 28%)',
          borderRadius: 8,
        }}
        animate={{ rotate: [0, 6, -6, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      <span className="text-[14px] font-extrabold tracking-wide text-ivory">Menu</span>
    </motion.button>
  )
}
