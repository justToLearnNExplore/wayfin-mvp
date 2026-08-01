/**
 * @file Sarvam AI providers — Saarika (ASR) and Bulbul (TTS).
 *
 * DORMANT UNTIL KEYED. Both adapters call our own serverless proxies
 * (/api/voice-stt, /api/voice-tts) which hold SARVAM_API_KEY server-side; the
 * key is never shipped to the browser. With no key configured the proxies
 * return 503 and {@link ../index.js} silently keeps using Web Speech.
 *
 * Why bother, given Web Speech is free:
 *   • Saarika is trained on Indian speech and handles code-mixed English/Hindi
 *     ("mujhe Nykaa jaana hai") which Web Speech mangles badly.
 *   • Bulbul produces natural Indian-accented guidance in en/hi/kn — the
 *     browser's default voice reads "Koramangala" and "Nykaa" poorly.
 *
 * NOTE ON NAMING: Bulbul is text-to-SPEECH (output). Saarika is the
 * speech-to-text model. They are frequently confused.
 */

/** @typedef {import('./types.js').SpeechRecognizer} SpeechRecognizer */
/** @typedef {import('./types.js').Speaker} Speaker */
/** @typedef {import('./types.js').RecognitionHandlers} RecognitionHandlers */

/** Longest single utterance we will record before force-stopping, in ms. */
const MAX_UTTERANCE_MS = 8000

/**
 * Saarika recogniser: records a short utterance with MediaRecorder, uploads it
 * to our proxy, and returns the transcript.
 *
 * Unlike Web Speech this yields no interim results — Saarika transcribes a
 * complete clip — so the UI should show a "listening…" state rather than a
 * live-typing effect.
 *
 * @param {{lang?: string}} [options]
 * @returns {SpeechRecognizer}
 */
export function createSarvamRecognizer(options = {}) {
  /** @type {MediaRecorder | null} */
  let recorder = null
  /** @type {MediaStream | null} */
  let stream = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout

  const cleanup = () => {
    clearTimeout(timeout)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    recorder = null
  }

  return {
    id: 'sarvam-saarika',
    isSupported:
      typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),

    /** @param {RecognitionHandlers} handlers */
    async start(handlers) {
      if (typeof MediaRecorder === 'undefined') return handlers.onError?.('not-supported')

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        return handlers.onError?.('denied')
      }

      /** @type {Blob[]} */
      const chunks = []
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      recorder.onstop = async () => {
        cleanup()
        if (chunks.length === 0) return handlers.onError?.('no-speech')

        try {
          const form = new FormData()
          form.append('audio', new Blob(chunks, { type: 'audio/webm' }), 'utterance.webm')
          form.append('language', options.lang ?? 'en-IN')

          const res = await fetch('/api/voice-stt', { method: 'POST', body: form })
          if (!res.ok) return handlers.onError?.(res.status === 503 ? 'not-supported' : 'network')

          const { transcript } = await res.json()
          if (transcript?.trim()) handlers.onResult(transcript.trim())
          else handlers.onError?.('no-speech')
        } catch {
          handlers.onError?.('network')
        } finally {
          handlers.onEnd?.()
        }
      }

      recorder.start()
      timeout = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), MAX_UTTERANCE_MS)
    },

    stop() {
      if (recorder?.state === 'recording') recorder.stop()
      else cleanup()
    },
  }
}

/**
 * Bulbul speaker: sends text to our proxy, receives base64 audio, plays it.
 * @returns {Speaker}
 */
export function createSarvamSpeaker() {
  /** @type {HTMLAudioElement | null} */
  let current = null

  return {
    id: 'sarvam-bulbul',
    isSupported: typeof Audio !== 'undefined',

    async speak(text, opts = {}) {
      if (!text) return
      if (opts.interrupt !== false) this.cancel()

      try {
        const res = await fetch('/api/voice-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang: opts.lang ?? 'en-IN', rate: opts.rate ?? 1 }),
        })
        if (!res.ok) return

        const { audioBase64, mimeType } = await res.json()
        if (!audioBase64) return

        const audio = new Audio(`data:${mimeType ?? 'audio/wav'};base64,${audioBase64}`)
        current = audio
        await new Promise((resolve) => {
          audio.onended = () => resolve(undefined)
          audio.onerror = () => resolve(undefined)
          audio.play().catch(() => resolve(undefined))
        })
      } catch {
        /* guidance is best-effort; never block navigation on audio */
      } finally {
        current = null
      }
    },

    cancel() {
      if (current) {
        current.pause()
        current = null
      }
    },
  }
}
