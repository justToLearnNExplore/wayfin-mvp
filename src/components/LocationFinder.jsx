import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { captureFrame, closeCamera, openRearCamera } from '../services/vision/camera.js'
import { localizeFromImage } from '../services/vision/localizer.js'
import { resolveLocationText } from '../services/localization/textResolver.js'
import { parseIntent } from '../services/intentParser.js'
import { CATALOGUE } from '../services/vision/catalogue.js'
import { createVoiceServices } from '../services/voice/index.js'
import { trackEvent } from '../lib/analytics.js'

/**
 * @file "Find my location" — the friction-removing entry point.
 *
 * Replaces the old "Where are you?" chip list with three routes to the same
 * answer: point the camera at a shopfront, say where you are, or type it.
 * Every route ends in the same {@link Anchor}, so downstream navigation is
 * identical regardless of how the user localized.
 *
 * DESIGN RULE — never place the dot on a guess. Vision auto-places only above
 * 0.85 confidence; below that the user confirms with one tap. A landmark that
 * exists on several floors always asks which floor, because no photo or
 * phrase can answer that.
 */

/**
 * @typedef {import('../services/localization/tracker.js').Anchor} Anchor
 * @typedef {import('../services/vision/catalogue.js').LandmarkMatch} LandmarkMatch
 */

/** UI state machine. */
/** @typedef {'chooser'|'camera'|'confirm'|'floor'|'manual'|'voice'|'text'} Screen */

const ICON = {
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </>
  ),
}

/**
 * @param {Object} props
 * @param {(anchor: Anchor) => void} props.onLocated
 * @param {() => void} props.onCancel
 * @param {string} [props.destinationName] Shown for context, e.g. "to SEPHORA".
 */
export default function LocationFinder({ onLocated, onCancel, destinationName }) {
  const [screen, setScreen] = useState(/** @type {Screen} */ ('chooser'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Vision result awaiting confirmation / floor choice.
  const [pending, setPending] = useState(
    /** @type {{label: string, matches: LandmarkMatch[], confidence: number, source: Anchor['source']} | null} */ (null)
  )

  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null))
  const streamRef = useRef(/** @type {MediaStream | null} */ (null))
  const [cameraState, setCameraState] = useState(
    /** @type {import('../services/vision/camera.js').CameraState} */ ('idle')
  )

  const [transcript, setTranscript] = useState('')
  const [typed, setTyped] = useState('')
  const [suggestions, setSuggestions] = useState(/** @type {string[]} */ ([]))
  const voiceRef = useRef(/** @type {ReturnType<typeof createVoiceServices> | null} */ (null))

  /** Commit a final anchor and hand control back to the caller. */
  const commit = useCallback(
    (/** @type {LandmarkMatch} */ match, /** @type {Anchor['source']} */ source, confidence = 1) => {
      trackEvent('location_found', { method: source, landmark: match.name, floor: match.floor })
      onLocated({
        x: match.x,
        y: match.y,
        floor: match.floor,
        source,
        label: match.name,
        confidence,
        // Carried so the chat can hand straight to the existing deterministic
        // routing without re-deriving a graph id from coordinates.
        nodeId: match.nodeId,
      })
    },
    [onLocated]
  )

  /**
   * Route a set of catalogue matches into the right next screen.
   * One match → done. Several floors → ask. Low confidence → confirm.
   */
  const handleMatches = useCallback(
    (
      /** @type {LandmarkMatch[]} */ matches,
      /** @type {string} */ label,
      /** @type {Anchor['source']} */ source,
      /** @type {number} */ confidence,
      /** @type {boolean} */ needsConfirm
    ) => {
      if (matches.length === 0) return
      setPending({ label, matches, confidence, source })
      if (matches.length > 1) return setScreen('floor')
      if (needsConfirm) return setScreen('confirm')
      commit(matches[0], source, confidence)
    },
    [commit]
  )

  // ---- camera -----------------------------------------------------------
  const stopCamera = useCallback(() => {
    closeCamera(streamRef.current)
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (screen !== 'camera') return
    let cancelled = false
    setCameraState('starting')
    ;(async () => {
      const el = videoRef.current
      if (!el) return
      const { stream, state } = await openRearCamera(el)
      if (cancelled) return closeCamera(stream)
      streamRef.current = stream
      setCameraState(state)
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [screen, stopCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  const scan = useCallback(async () => {
    const el = videoRef.current
    if (!el || busy) return
    const image = captureFrame(el)
    if (!image) return setError('Camera not ready yet — try again.')

    setBusy(true)
    setError('')
    trackEvent('localize_camera_scan')
    const result = await localizeFromImage(image)
    setBusy(false)

    switch (result.status) {
      case 'placed':
        return handleMatches(result.matches, result.landmark, 'vision', result.confidence, false)
      case 'confirm':
        return handleMatches(result.matches, result.landmark, 'vision', result.confidence, true)
      case 'choose-floor':
        return handleMatches(result.matches, result.landmark, 'vision', result.confidence, false)
      case 'no-match':
        return setError("Couldn't read a store sign. Point at a shopfront, or pick it manually.")
      case 'unavailable':
        setError('')
        return setScreen('manual')
      default:
        return setError('That didn’t work. Try again, or pick your spot manually.')
    }
  }, [busy, handleMatches])

  // ---- voice ------------------------------------------------------------
  const startListening = useCallback(() => {
    if (!voiceRef.current) voiceRef.current = createVoiceServices()
    const { recognizer } = voiceRef.current

    if (!recognizer.isSupported) {
      setError('Voice input is not supported in this browser — type it instead.')
      return setScreen('text')
    }

    setTranscript('')
    setError('')
    setBusy(true)
    trackEvent('localize_voice_start')

    recognizer.start({
      onPartial: (text) => setTranscript(text),
      onResult: async (text) => {
        setTranscript(text)

        // Local first: "I'm at H&M" resolves instantly and for free.
        const resolved = resolveLocationText(text)
        // 'ambiguous' is a multi-floor landmark — the floor picker handles it
        // locally, so it must not fall through to the parser.
        if (resolved.status === 'match' || resolved.status === 'ambiguous' || resolved.status === 'suggestions') {
          setBusy(false)
          if (resolved.status === 'suggestions') {
            setSuggestions(resolved.candidates?.map((c) => c.name) ?? [])
            return setScreen('text')
          }
          return handleMatches(resolved.matches ?? [], resolved.entry?.name ?? text, 'voice', 0.9, false)
        }

        // Then the LLM. Voice used to stop at the offline matcher, which can
        // only find ONE landmark in a phrase — so "I'm near H&M, my friend is
        // near NIKE" left the friend slot empty and the bot asked again. That
        // looked like poor speech recognition and was nothing of the kind:
        // typing the same sentence has always worked, because typing goes
        // through this parser and speech did not.
        const parsed = await parseIntent(text)
        setBusy(false)
        const spoken = parsed?.origin ?? parsed?.destination ?? parsed?.friendLocation
        if (spoken) {
          const viaLlm = resolveLocationText(spoken)
          if (viaLlm.status === 'match') {
            return handleMatches(viaLlm.matches ?? [], viaLlm.entry?.name ?? spoken, 'voice', 0.9, false)
          }
        }
        setError(`Heard "${text}" — I couldn't match that to a place here.`)
      },
      onError: (reason) => {
        setBusy(false)
        setError(
          reason === 'denied'
            ? 'Microphone access was blocked. Type your location instead.'
            : reason === 'no-speech'
              ? "Didn't catch that — try again."
              : 'Voice input failed. Type your location instead.'
        )
      },
      onEnd: () => setBusy(false),
    })
  }, [handleMatches])

  // The listener is started ONCE per entry to the voice screen.
  //
  // This effect must not depend on `startListening`'s identity. That callback
  // is rebuilt whenever `onLocated` changes, and App passes `onLocated` as an
  // inline arrow — so it changes on every App render, and App re-renders at
  // 15 Hz while live positioning is running. Depending on it meant the effect
  // tore down and restarted recognition fifteen times a second. On Android
  // every `recognition.start()` plays the system chime, which is the beeping
  // and the frozen, unclickable screen.
  //
  // Held in a ref so the effect always calls the current closure while
  // depending only on `screen`.
  const startListeningRef = useRef(startListening)
  startListeningRef.current = startListening

  useEffect(() => {
    if (screen !== 'voice') return undefined
    startListeningRef.current()
    return () => voiceRef.current?.recognizer.stop()
  }, [screen])

  // ---- text -------------------------------------------------------------
  const submitText = useCallback(
    (/** @type {string} */ value) => {
      const resolved = resolveLocationText(value)
      setError('')
      if (resolved.status === 'none') {
        setSuggestions([])
        return setError("I don't know that place. Try a store name you can see.")
      }
      if (resolved.status === 'suggestions') {
        return setSuggestions(resolved.candidates?.map((c) => c.name) ?? [])
      }
      handleMatches(resolved.matches ?? [], resolved.entry?.name ?? value, 'text', 0.95, false)
    },
    [handleMatches]
  )

  const allNames = useRef(/** @type {string[]} */ ([]))
  if (allNames.current.length === 0) {
    allNames.current = [...CATALOGUE.values()].map((e) => e.name)
  }

  /** Common chrome around every screen. @param {any} children */
  const shell = (children) => (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-label="Find my location"
      className="fixed inset-0 z-[65] flex min-h-dvh flex-col overflow-y-auto bg-obsidian text-ivory"
    >
      <header className="flex items-start justify-between px-5 pt-[max(2.5rem,var(--safe-top))]">
        <div>
          <h2 className="font-display text-[24px] leading-tight">Find my location</h2>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-champagne-soft">
            {destinationName ? `TO ROUTE YOU TO ${destinationName.toUpperCase()}` : 'ORION MALL · BRIGADE GATEWAY'}
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Cancel finding location"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ivory/20 text-ivory/75 cursor-pointer active:bg-ivory/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(1.5rem,var(--safe-bottom))] pt-6">
        {children}
      </div>
    </motion.section>
  )

  const errorNote = error ? (
    <p role="status" className="mt-4 rounded-xl border border-magenta/40 bg-magenta/10 px-4 py-3 text-[12.5px] leading-relaxed text-ivory/85">
      {error}
    </p>
  ) : null

  // ---- screens ----------------------------------------------------------
  if (screen === 'chooser') {
    /** @type {{id: Screen, label: string, hint: string, icon: keyof typeof ICON}[]} */
    const options = [
      { id: 'camera', label: 'Point Camera', hint: 'Fastest — aim at any store sign', icon: 'camera' },
      { id: 'voice', label: 'Speak', hint: 'Say "I’m outside H&M"', icon: 'mic' },
      { id: 'text', label: 'Type', hint: 'Enter a store or landmark', icon: 'keyboard' },
    ]

    return createPortal(
      shell(
        <>
          <p className="text-[13.5px] leading-relaxed text-ivory/65">
            Tell wayFin where you are and the route starts from your exact spot.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {options.map((option, index) => (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + index * 0.07, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                onClick={() => {
                  setError('')
                  setScreen(option.id)
                }}
                className="flex min-h-[76px] items-center gap-4 rounded-2xl border border-champagne/35 bg-champagne/5 px-4 text-left transition-colors cursor-pointer active:bg-champagne/20"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-champagne/40 bg-obsidian-2">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D8B65C" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    {ICON[option.icon]}
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[19px] leading-tight">{option.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ivory/55">{option.hint}</span>
                </span>
              </motion.button>
            ))}
          </div>
          {errorNote}
        </>
      ),
      document.body
    )
  }

  if (screen === 'camera') {
    return createPortal(
      shell(
        <>
          <div className="relative mx-auto aspect-square w-[min(84vw,360px,44dvh)] shrink-0 overflow-hidden rounded-[26px] border border-champagne/45 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {cameraState !== 'live' && (
              <div className="absolute inset-0 flex items-center justify-center px-7 text-center text-[12.5px] leading-relaxed text-ivory/65">
                {cameraState === 'starting'
                  ? 'Opening the camera…'
                  : cameraState === 'denied'
                    ? 'Camera access was blocked. Use Speak or Type instead.'
                    : 'Camera unavailable here (needs https). Use Speak or Type.'}
              </div>
            )}
            {['top-4 left-4 border-t-2 border-l-2 rounded-tl-xl', 'top-4 right-4 border-t-2 border-r-2 rounded-tr-xl', 'bottom-4 left-4 border-b-2 border-l-2 rounded-bl-xl', 'bottom-4 right-4 border-b-2 border-r-2 rounded-br-xl'].map((cls) => (
              <div key={cls} className={`pointer-events-none absolute h-9 w-9 border-champagne ${cls}`} />
            ))}
            <AnimatePresence>
              {busy && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  aria-live="polite"
                  className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian/80 backdrop-blur-sm"
                >
                  <motion.div
                    className="h-11 w-11 rounded-full border-2 border-champagne border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="mt-4 font-display text-[19px]">Reading your surroundings</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="mt-5 text-center text-[12.5px] leading-relaxed text-ivory/60">
            Aim at a store sign, escalator or mall entrance.
          </p>
          <button
            onClick={scan}
            disabled={cameraState !== 'live' || busy}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-champagne/70 bg-champagne/15 text-[13px] font-extrabold text-champagne-soft cursor-pointer active:bg-champagne/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Scan surroundings
          </button>
          {errorNote}
          <button onClick={() => setScreen('chooser')} className="mt-5 text-[12px] font-semibold text-ivory/45 underline underline-offset-2 cursor-pointer">
            Use another method
          </button>
        </>
      ),
      document.body
    )
  }

  if (screen === 'confirm' && pending) {
    const match = pending.matches[0]
    return createPortal(
      shell(
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-[11px] font-bold tracking-[0.2em] text-champagne-soft">
            {Math.round(pending.confidence * 100)}% MATCH
          </p>
          <h3 className="font-display mt-2 text-[30px] leading-tight">Are you near {match.name}?</h3>
          <p className="mt-2 text-[13px] text-ivory/60">{match.floorLabel}</p>
          <div className="mt-7 flex gap-3">
            <button
              onClick={() => commit(match, pending.source, pending.confidence)}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-champagne/70 bg-champagne/15 text-[14px] font-extrabold text-champagne-soft cursor-pointer active:bg-champagne/30"
            >
              Yes
            </button>
            <button
              onClick={() => {
                setPending(null)
                setError('')
                setScreen('manual')
              }}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-ivory/25 text-[14px] font-bold text-ivory/80 cursor-pointer active:bg-ivory/10"
            >
              No
            </button>
          </div>
        </div>
      ),
      document.body
    )
  }

  if (screen === 'floor' && pending) {
    return createPortal(
      shell(
        <div className="flex flex-1 flex-col justify-center">
          <h3 className="font-display text-[28px] leading-tight">
            Which floor is {pending.label} on?
          </h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ivory/60">
            {pending.label} appears on more than one level, and a photo can&apos;t tell them apart.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            {pending.matches.map((match) => (
              <button
                key={match.nodeId}
                onClick={() => commit(match, pending.source, pending.confidence)}
                className="flex min-h-[54px] items-center justify-between rounded-xl border border-champagne/35 bg-champagne/5 px-4 text-left text-[14px] font-semibold cursor-pointer active:bg-champagne/20"
              >
                {match.floorLabel}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D8B65C" strokeWidth="2.5" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ),
      document.body
    )
  }

  if (screen === 'manual') {
    const query = typed.trim().toLowerCase()
    const list = (query
      ? allNames.current.filter((n) => n.toLowerCase().includes(query))
      : allNames.current
    ).slice(0, 40)

    return createPortal(
      shell(
        <>
          <h3 className="font-display text-[22px] leading-tight">Pick the nearest place</h3>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search stores and landmarks"
            aria-label="Search stores and landmarks"
            className="mt-4 min-h-12 w-full rounded-xl border border-ivory/15 bg-ivory/5 px-4 text-[16px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
          />
          <div className="mt-3 flex flex-col gap-2 overflow-y-auto">
            {list.map((name) => {
              const entry = CATALOGUE.get(name.toUpperCase())
              if (!entry) return null
              return (
                <button
                  key={name}
                  onClick={() => handleMatches(entry.matches, entry.name, 'manual', 1, false)}
                  className="flex min-h-[48px] items-center justify-between rounded-xl border border-ivory/12 bg-ivory/5 px-4 text-left text-[13.5px] font-semibold cursor-pointer active:bg-champagne/15"
                >
                  {name}
                  <span className="text-[10.5px] font-normal text-ivory/45">
                    {entry.ambiguous ? `${entry.matches.length} floors` : entry.matches[0].floorLabel}
                  </span>
                </button>
              )
            })}
            {list.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-ivory/45">No matches in this mall.</p>
            )}
          </div>
          <button onClick={() => setScreen('chooser')} className="mt-4 shrink-0 text-[12px] font-semibold text-ivory/45 underline underline-offset-2 cursor-pointer">
            Back
          </button>
        </>
      ),
      document.body
    )
  }

  if (screen === 'voice') {
    return createPortal(
      shell(
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div
            animate={busy ? { scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 0.85 }}
            transition={busy ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' } : {}}
            className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan/50 bg-cyan/10"
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#38C7D8" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {ICON.mic}
            </svg>
          </motion.div>
          <p className="mt-6 font-display text-[22px]">{busy ? 'Listening…' : 'Tap to speak again'}</p>
          <p className="mt-2 min-h-[42px] max-w-[290px] text-[13px] leading-relaxed text-ivory/60">
            {transcript || 'Try "I’m outside H&M" or "near the food court"'}
          </p>
          {errorNote}
          <div className="mt-6 flex w-full gap-3">
            <button
              onClick={startListening}
              disabled={busy}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-cyan/50 bg-cyan/10 text-[13px] font-extrabold text-cyan cursor-pointer active:bg-cyan/20 disabled:opacity-40"
            >
              {busy ? 'Listening' : 'Speak again'}
            </button>
            <button
              onClick={() => setScreen('text')}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-ivory/25 text-[13px] font-bold text-ivory/80 cursor-pointer active:bg-ivory/10"
            >
              Type instead
            </button>
          </div>
        </div>
      ),
      document.body
    )
  }

  // screen === 'text'
  return createPortal(
    shell(
      <>
        <h3 className="font-display text-[22px] leading-tight">Where are you right now?</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitText(typed)
          }}
          className="mt-4"
        >
          <input
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              setError('')
            }}
            autoFocus
            placeholder="e.g. outside H&amp;M"
            aria-label="Describe where you are"
            className="min-h-12 w-full rounded-xl border border-ivory/15 bg-ivory/5 px-4 text-[16px] text-ivory placeholder:text-ivory/35 outline-none focus:border-champagne/60"
          />
          <button
            type="submit"
            disabled={!typed.trim()}
            className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-champagne/70 bg-champagne/15 text-[13px] font-extrabold text-champagne-soft cursor-pointer active:bg-champagne/30 disabled:opacity-40"
          >
            Find me
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-bold tracking-[0.18em] text-champagne-soft">DID YOU MEAN</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((name) => {
                const entry = CATALOGUE.get(name.toUpperCase())
                if (!entry) return null
                return (
                  <button
                    key={name}
                    onClick={() => handleMatches(entry.matches, entry.name, 'text', 1, false)}
                    className="flex min-h-11 items-center rounded-full border border-champagne/45 bg-champagne/8 px-3.5 text-[12px] font-semibold cursor-pointer active:bg-champagne/25"
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {errorNote}

        <button onClick={() => setScreen('manual')} className="mt-5 text-[12px] font-semibold text-ivory/45 underline underline-offset-2 cursor-pointer">
          Browse all places instead
        </button>
      </>
    ),
    document.body
  )
}
