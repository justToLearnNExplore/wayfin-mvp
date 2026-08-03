import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { allStores, floorLabelOf } from '../lib/routing.js'
import { searchStores, categoriesBySize } from '../services/navigation/storeSearch.js'
import { createVoiceServices } from '../services/voice/index.js'
import { trackEvent } from '../lib/analytics.js'

/**
 * @file "Where to?" — the counterpart to LocationFinder.
 *
 * Origin has had camera / speak / type since Chunk C. Destination had nothing:
 * the only ways to set one were tapping a store card or typing into the chat,
 * so a shopper who knew exactly which shop they wanted still had to go hunting
 * through a grid to say so. That asymmetry is most of why the app felt like a
 * dead end.
 *
 * Three doors here, chosen over four:
 *
 *   TYPE    prefix-first autocomplete over the whole catalogue. This is the
 *           one that makes all 132 stores reachable, which is separately the
 *           answer to "not every store is visible on the map" — the map stays
 *           legible and search carries the long tail.
 *   SPEAK   reuses the existing recogniser. Genuinely useful with bags in hand.
 *   BROWSE  by category, for the shopper who wants "somewhere for shoes"
 *           rather than a named brand. That is how most mall visitors actually
 *           think, and it was previously buried mid-conversation.
 *
 * NO CAMERA HERE, deliberately. Photographing a directory board costs a vision
 * call and a round trip to do what three letters of autocomplete do instantly.
 * The camera earns its place on the ORIGIN side, where the whole problem is
 * that you cannot type what you do not know.
 */

/** @typedef {{id: string, name: string, floor: string, category?: string}} StoreNode */

/** @typedef {'search' | 'browse' | 'voice'} Screen */

export default function DestinationFinder({ onPick, onCancel, originName }) {
  const [screen, setScreen] = useState(/** @type {Screen} */ ('search'))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(/** @type {string | null} */ (null))
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const voiceRef = useRef(/** @type {ReturnType<typeof createVoiceServices> | null} */ (null))

  const stores = useMemo(() => allStores(), [])
  const categories = useMemo(() => categoriesBySize(stores), [stores])

  const results = useMemo(() => {
    if (category) return stores.filter((s) => s.category === category)
    return searchStores(query, stores, { limit: 10 })
  }, [query, category, stores])

  const pick = useCallback(
    (/** @type {StoreNode} */ store) => {
      trackEvent('destination_picked', { store: store.name, via: category ? 'browse' : 'search' })
      onPick(store)
    },
    [onPick, category]
  )

  // ---- voice --------------------------------------------------------------
  const startListening = useCallback(() => {
    if (!voiceRef.current) voiceRef.current = createVoiceServices()
    const { recognizer } = voiceRef.current

    if (!recognizer.isSupported) {
      setError('Voice input is not supported here — type it instead.')
      return setScreen('search')
    }

    setError('')
    setListening(true)
    trackEvent('destination_voice_start')

    recognizer.start({
      onPartial: (text) => setQuery(text),
      onResult: (text) => {
        setListening(false)
        setQuery(text)
        setCategory(null)
        // Straight to results rather than auto-picking: speech recognition on
        // brand names is the least reliable input we have, so the user
        // confirms which shop they meant.
        setScreen('search')
        const hits = searchStores(text, stores, { limit: 1 })
        if (!hits.length) setError(`Heard "${text}" — no store here matches that.`)
      },
      onError: (reason) => {
        setListening(false)
        setScreen('search')
        setError(
          reason === 'denied'
            ? 'Microphone access was blocked. Type it instead.'
            : reason === 'no-speech'
              ? "Didn't catch that — try again, or type it."
              : 'Voice input failed. Type it instead.'
        )
      },
      onEnd: () => setListening(false),
    })
  }, [stores])

  // Depends only on `screen`, never on the callback's identity — the same
  // mistake on the origin screen restarted recognition on every render and
  // produced a continuous chime on Android.
  const startListeningRef = useRef(startListening)
  startListeningRef.current = startListening

  useEffect(() => {
    if (screen !== 'voice') return undefined
    startListeningRef.current()
    return () => voiceRef.current?.recognizer.stop()
  }, [screen])

  useEffect(() => {
    if (screen === 'search') inputRef.current?.focus()
  }, [screen])

  const heading = category ?? (screen === 'voice' ? 'Listening…' : 'Where to?')

  return createPortal(
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-label="Choose a destination"
      className="fixed inset-0 z-[60] mx-auto flex min-h-dvh max-w-[430px] flex-col bg-obsidian text-ivory"
    >
      <header className="flex flex-none items-center justify-between px-5 pt-[max(2.2rem,var(--safe-top))]">
        <div>
          <h2 className="font-display text-[21px]">{heading}</h2>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-champagne-soft">
            {originName ? `FROM ${originName.toUpperCase()}` : 'PICK YOUR DESTINATION'}
          </p>
        </div>
        <button
          onClick={category ? () => setCategory(null) : onCancel}
          aria-label={category ? 'Back to all categories' : 'Cancel'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/20 text-ivory/75 cursor-pointer active:bg-ivory/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {category ? <path d="M15 18l-6-6 6-6" /> : <path d="M18 6L6 18M6 6l12 12" />}
          </svg>
        </button>
      </header>

      {/* search field — always present, so typing is never more than a tap away */}
      {!category && (
        <div className="flex-none px-5 pt-5">
          <div className="flex items-center gap-2 rounded-2xl border border-ivory/15 bg-ivory/5 px-4 focus-within:border-champagne/60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none text-ivory/40" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setError('')
              }}
              // Counted, not hardcoded: the catalogue grows when the official
              // map data lands, and a placeholder that overstates it is a
              // small lie the user can check in three taps.
              placeholder={`Search ${stores.length} stores…`}
              aria-label="Search stores"
              className="min-h-12 w-full bg-transparent text-[15px] text-ivory placeholder:text-ivory/35 outline-none"
            />
            <button
              onClick={() => setScreen(screen === 'voice' ? 'search' : 'voice')}
              aria-label="Speak the store name"
              aria-pressed={screen === 'voice'}
              className={`flex h-11 w-11 flex-none items-center justify-center rounded-lg cursor-pointer ${
                listening ? 'bg-cyan/20 text-cyan' : 'text-champagne-soft active:bg-ivory/10'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
              </svg>
            </button>
          </div>

          {listening && (
            <p className="mt-2 flex items-center gap-2 text-[11.5px] text-cyan">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
              Listening — say a store name
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[11.5px] text-ivory/70">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,var(--safe-bottom))] pt-4">
        <AnimatePresence mode="popLayout">
          {results.length > 0 && (
            <motion.ul
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-2"
            >
              {results.map((store) => (
                <li key={store.id}>
                  <button
                    onClick={() => pick(store)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-ivory/12 bg-obsidian-2 px-4 py-2.5 text-left cursor-pointer active:bg-ivory/10"
                  >
                    <span className="text-[14px] font-semibold">{store.name}</span>
                    <span className="flex-none text-[10px] font-bold tracking-[0.12em] text-ivory/40">
                      {floorLabelOf(store.floor).toUpperCase()}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {/* Nothing typed yet, or nothing matched — offer categories rather than
            an empty screen. Browsing is the answer for "somewhere for shoes". */}
        {!category && results.length === 0 && (
          <div>
            {query.trim() && (
              <p className="mb-5 rounded-xl border border-ivory/12 bg-ivory/5 px-4 py-3 text-[13px] text-ivory/70">
                No store called “{query.trim()}” at Orion. Browse instead:
              </p>
            )}
            <p className="mb-2.5 text-[10px] font-bold tracking-[0.18em] text-ivory/40">
              BROWSE BY CATEGORY
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map(({ category: name, count }) => (
                <button
                  key={name}
                  onClick={() => {
                    setCategory(name)
                    setQuery('')
                  }}
                  className="flex min-h-11 items-center gap-1.5 rounded-full border border-champagne/40 bg-champagne/8 px-4 text-[12px] font-bold text-champagne-soft cursor-pointer active:bg-champagne/20"
                >
                  {name}
                  <span className="text-[10px] font-semibold text-champagne-soft/60">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>,
    document.body
  )
}
