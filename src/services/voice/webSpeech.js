/**
 * @file Web Speech API provider — the zero-dependency default.
 *
 * Support reality (why the UI must always offer a typed fallback):
 *   • Android Chrome  — recognition + synthesis both work well.
 *   • iOS Safari      — synthesis works; recognition is supported from iOS 14.5
 *                       but is flaky and needs a fresh user gesture each time.
 *   • Desktop Chrome  — both work; recognition routes via Google servers.
 *   • Firefox         — no recognition at all.
 *
 * We request en-IN so Indian place and brand names ("Koramangala", "Nykaa")
 * are transcribed far more accurately than with en-US.
 */

/** @typedef {import('./types.js').SpeechRecognizer} SpeechRecognizer */
/** @typedef {import('./types.js').Speaker} Speaker */
/** @typedef {import('./types.js').RecognitionHandlers} RecognitionHandlers */

/** @returns {any} The vendor-prefixed constructor, if any. */
function recognitionCtor() {
  const w = /** @type {any} */ (globalThis)
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Create a Web Speech recogniser.
 * @param {{lang?: string}} [options]
 * @returns {SpeechRecognizer}
 */
export function createWebSpeechRecognizer(options = {}) {
  const Ctor = recognitionCtor()
  /** @type {any} */
  let active = null

  return {
    id: 'web-speech',
    isSupported: Boolean(Ctor),

    /** @param {RecognitionHandlers} handlers */
    start(handlers) {
      if (!Ctor) {
        handlers.onError?.('not-supported')
        return
      }
      // Already listening — ignore rather than stacking a second session.
      //
      // Android Chrome plays an audible chime on every start(), so a caller
      // that re-invokes this in a render loop produces a machine-gun beep and
      // a UI too busy to accept a tap. A caller bug should not be able to do
      // that, so the guard lives here as well as at the call site.
      if (active) return

      // Recreate per session: reusing an instance after `stop()` is unreliable
      // across browsers.
      const recognition = new Ctor()
      active = recognition
      recognition.lang = options.lang ?? 'en-IN'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.maxAlternatives = 1

      recognition.onresult = (/** @type {any} */ event) => {
        let finalText = ''
        let partial = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) finalText += result[0].transcript
          else partial += result[0].transcript
        }
        if (partial) handlers.onPartial?.(partial.trim())
        if (finalText) handlers.onResult(finalText.trim())
      }

      recognition.onerror = (/** @type {any} */ event) => {
        /** @type {Record<string, import('./types.js').RecognitionError>} */
        const map = {
          'not-allowed': 'denied',
          'service-not-allowed': 'denied',
          'no-speech': 'no-speech',
          network: 'network',
          aborted: 'aborted',
        }
        handlers.onError?.(map[event.error] ?? 'unknown')
      }

      recognition.onend = () => {
        active = null
        handlers.onEnd?.()
      }

      try {
        recognition.start()
      } catch {
        // Thrown when start() is called while already running.
        handlers.onError?.('unknown')
      }
    },

    stop() {
      try {
        active?.stop()
      } catch {
        /* already stopped */
      }
      active = null
    },
  }
}

/**
 * Create a Web Speech synthesiser for turn-by-turn guidance.
 * @returns {Speaker}
 */
export function createWebSpeechSpeaker() {
  const synth = globalThis.speechSynthesis

  /**
   * Pick the best available voice for a language, preferring Indian locales.
   * Voices load asynchronously, so this is resolved per utterance.
   * @param {string} lang
   */
  const pickVoice = (lang) => {
    const voices = synth?.getVoices?.() ?? []
    return (
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang?.startsWith(lang.split('-')[0])) ??
      null
    )
  }

  return {
    id: 'web-speech',
    isSupported: typeof synth !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',

    speak(text, opts = {}) {
      return new Promise((resolve) => {
        if (!synth || !text) return resolve()
        // Guidance is time-critical: a new instruction supersedes an old one.
        if (opts.interrupt !== false) synth.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = opts.lang ?? 'en-IN'
        utterance.rate = opts.rate ?? 1
        const voice = pickVoice(utterance.lang)
        if (voice) utterance.voice = voice

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        synth.speak(utterance)
      })
    },

    cancel() {
      synth?.cancel()
    },
  }
}
