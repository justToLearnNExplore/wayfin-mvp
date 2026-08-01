/**
 * @file Client for /api/localize-vision.
 *
 * Returns a discriminated result rather than throwing, so the UI can branch
 * cleanly between "place the dot", "ask the user to confirm", "ask which
 * floor", and "vision is unavailable — offer the manual picker".
 *
 * We deliberately never synthesise a recognition result when the service is
 * unavailable: a wrong blue dot is far worse than an honest fallback.
 */

/**
 * @typedef {import('./catalogue.js').LandmarkMatch} LandmarkMatch
 */

/**
 * @typedef {Object} VisionSuccess
 * @property {'placed' | 'confirm' | 'choose-floor'} status
 * @property {string} landmark
 * @property {number} confidence
 * @property {LandmarkMatch[]} matches
 * @property {string[]} visibleText
 */

/**
 * @typedef {Object} VisionFailure
 * @property {'no-match' | 'unavailable' | 'error'} status
 * @property {string[]} [visibleText]
 * @property {string} [reason]
 */

/** @typedef {VisionSuccess | VisionFailure} VisionResult */

const REQUEST_TIMEOUT_MS = 12000

/**
 * Identify the user's location from a camera frame.
 *
 * @param {string} imageDataUrl JPEG/PNG/WebP data URL.
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<VisionResult>}
 */
export async function localizeFromImage(imageDataUrl, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  opts.signal?.addEventListener('abort', () => controller.abort())

  try {
    const res = await fetch('/api/localize-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
      signal: controller.signal,
    })

    if (res.status === 503) return { status: 'unavailable', reason: 'no_api_key' }
    if (!res.ok) return { status: 'error', reason: `http_${res.status}` }

    const data = await res.json()
    const visibleText = Array.isArray(data.visibleText) ? data.visibleText : []

    if (!data.landmark || !Array.isArray(data.matches) || data.matches.length === 0) {
      return { status: 'no-match', visibleText }
    }

    // One landmark name, several floors (escalators, multi-floor brands):
    // a photo genuinely cannot disambiguate, so ask rather than guess.
    if (data.ambiguous) {
      return {
        status: 'choose-floor',
        landmark: data.landmark,
        confidence: data.confidence,
        matches: data.matches,
        visibleText,
      }
    }

    return {
      status: data.autoPlace ? 'placed' : 'confirm',
      landmark: data.landmark,
      confidence: data.confidence,
      matches: data.matches,
      visibleText,
    }
  } catch (err) {
    const aborted = /** @type {any} */ (err)?.name === 'AbortError'
    return { status: 'error', reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
