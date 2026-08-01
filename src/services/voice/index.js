/**
 * @file Voice provider selection.
 *
 * Web Speech is returned synchronously so a mic tap never waits on a network
 * probe. Sarvam is detected in the background via a cheap capability check and
 * used from the next interaction onward once confirmed — an upgrade the user
 * never has to think about, and which silently no-ops when unkeyed.
 */

import { createWebSpeechRecognizer, createWebSpeechSpeaker } from './webSpeech.js'
import { createSarvamRecognizer, createSarvamSpeaker } from './sarvam.js'

/** @typedef {import('./types.js').SpeechRecognizer} SpeechRecognizer */
/** @typedef {import('./types.js').Speaker} Speaker */

/** @type {boolean | null} null = not yet probed. */
let sarvamReady = null
/** @type {Promise<boolean> | null} */
let probeInFlight = null

/**
 * Ask the server whether SARVAM_API_KEY is configured. Cached for the session.
 * Safe to call on app start; failures simply mean "stay on Web Speech".
 * @returns {Promise<boolean>}
 */
export function probeSarvam() {
  if (sarvamReady !== null) return Promise.resolve(sarvamReady)
  if (probeInFlight) return probeInFlight

  probeInFlight = fetch('/api/voice-tts', { method: 'GET' })
    .then((res) => (res.ok ? res.json() : { enabled: false }))
    .then((data) => {
      sarvamReady = Boolean(data?.enabled)
      return sarvamReady
    })
    .catch(() => {
      sarvamReady = false
      return false
    })
    .finally(() => {
      probeInFlight = null
    })

  return probeInFlight
}

/**
 * @typedef {Object} VoiceServices
 * @property {SpeechRecognizer} recognizer
 * @property {Speaker} speaker
 * @property {'sarvam' | 'web-speech'} provider
 */

/**
 * Build the active voice services.
 * @param {{forceProvider?: 'sarvam' | 'web-speech'}} [options]
 * @returns {VoiceServices}
 */
export function createVoiceServices(options = {}) {
  const useSarvam = options.forceProvider
    ? options.forceProvider === 'sarvam'
    : sarvamReady === true

  if (useSarvam) {
    const recognizer = createSarvamRecognizer()
    // Saarika needs MediaRecorder; degrade rather than break if it's missing.
    if (recognizer.isSupported) {
      return { recognizer, speaker: createSarvamSpeaker(), provider: 'sarvam' }
    }
  }

  return {
    recognizer: createWebSpeechRecognizer(),
    speaker: createWebSpeechSpeaker(),
    provider: 'web-speech',
  }
}

export { createWebSpeechRecognizer, createWebSpeechSpeaker, createSarvamRecognizer, createSarvamSpeaker }
