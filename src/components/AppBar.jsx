import { motion } from 'framer-motion'
import ThemeToggle from './ThemeToggle.jsx'

/**
 * The one bar that appears on every screen.
 *
 * WHY IT EXISTS. Before this, `setScene` was called exactly once in the whole
 * app — to enter the mall. Nothing ever went back. A shopper who tapped
 * "Enter the mall" had no route to the assistant, the start, or anywhere else
 * except reloading the page. In a mall, on a phone, mid-errand, that is the
 * worst possible moment to lose your place.
 *
 * So the contract is: from any screen you can always go back one step, always
 * return to the start, and always see which floor you are looking at. Three
 * things, one row, no chrome beyond that — this sits above a map and a 4×4
 * grid of shopfronts and must not compete with either.
 *
 * @param {Object} props
 * @param {() => void} [props.onBack]  Omit to hide the back arrow (top level).
 * @param {() => void} [props.onHome]  Tapping the wordmark. Omit to disable.
 * @param {string} [props.context]     Right-hand label: floor, or screen name.
 * @param {import('react').ReactNode} [props.action] Optional trailing control.
 */
export default function AppBar({ onBack, onHome, context, action }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-30 flex flex-none items-center gap-2.5 border-b border-ivory/10 bg-obsidian/90 px-3 pb-2.5 pt-[max(0.7rem,var(--safe-top))] backdrop-blur-md"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-ivory/15 text-ivory/70 cursor-pointer active:bg-ivory/10"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* The wordmark doubles as Home. Rendered as a real button when it acts
          as one, so it is reachable by keyboard and announced as a control. */}
      {onHome ? (
        <button
          type="button"
          onClick={onHome}
          aria-label="Back to start"
          className="flex min-h-11 items-center font-display text-[17px] leading-none tracking-tight text-ivory cursor-pointer"
        >
          way<span className="italic text-champagne-soft">Fin</span>
        </button>
      ) : (
        <span className="font-display text-[17px] leading-none tracking-tight text-ivory">
          way<span className="italic text-champagne-soft">Fin</span>
        </span>
      )}

      {context && (
        <span className="ml-auto rounded-full border border-champagne/35 px-2.5 py-1 text-[9.5px] font-bold tracking-[0.14em] text-champagne-soft">
          {context.toUpperCase()}
        </span>
      )}

      {action && <div className={context ? 'flex-none' : 'ml-auto flex-none'}>{action}</div>}

      {/* Always last, so its position is the same on every screen — a control
          people hunt for is a control they stop using. */}
      <ThemeToggle className={context || action ? 'flex-none' : 'ml-auto'} />
    </motion.header>
  )
}
