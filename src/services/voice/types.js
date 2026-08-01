/**
 * @file Voice provider contracts.
 *
 * wayFin needs two capabilities, and they are deliberately separate because
 * the best provider differs for each:
 *
 *   • RECOGNITION (speech → text) drives localization and destination intent.
 *   • SPEECH (text → audio) reads turn-by-turn guidance aloud while walking,
 *     which is the only hands-free part of the product.
 *
 * Today both are served by the browser's built-in Web Speech API: free, no
 * key, instant. Sarvam's Saarika (ASR) and Bulbul (TTS) implement the same
 * interfaces and handle Indian English, Hindi and Kannada far better — they
 * activate the moment SARVAM_API_KEY is present, with no call-site changes.
 *
 * @module voice/types
 */

/**
 * @typedef {Object} RecognitionHandlers
 * @property {(text: string) => void} [onPartial]  Live interim transcript.
 * @property {(text: string) => void} onResult     Final transcript.
 * @property {(reason: RecognitionError) => void} [onError]
 * @property {() => void} [onEnd]
 */

/**
 * @typedef {'not-supported' | 'denied' | 'no-speech' | 'network' | 'aborted' | 'unknown'} RecognitionError
 */

/**
 * @typedef {Object} SpeechRecognizer
 * @property {string} id
 * @property {boolean} isSupported
 * @property {(handlers: RecognitionHandlers) => Promise<void> | void} start
 * @property {() => void} stop
 */

/**
 * @typedef {Object} SpeakOptions
 * @property {number} [rate]   0.5..2, default 1.
 * @property {'en-IN'|'hi-IN'|'kn-IN'} [lang]
 * @property {boolean} [interrupt]  Cancel anything currently speaking.
 */

/**
 * @typedef {Object} Speaker
 * @property {string} id
 * @property {boolean} isSupported
 * @property {(text: string, options?: SpeakOptions) => Promise<void>} speak
 * @property {() => void} cancel
 */

export {}
