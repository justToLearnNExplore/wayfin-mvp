/**
 * @file Motion/orientation permission handling.
 *
 * iOS 13+ gates DeviceMotionEvent and DeviceOrientationEvent behind an
 * explicit permission request that MUST be called from inside a user gesture
 * (a real tap). Android and desktop Chrome expose the sensors without a
 * prompt. This module hides that split behind one call.
 */

/**
 * @typedef {'granted' | 'denied' | 'unsupported'} SensorPermission
 */

/**
 * True when the browser exposes the iOS-style permission gate.
 * @param {any} ctor
 * @returns {boolean}
 */
function needsExplicitGrant(ctor) {
  return typeof ctor !== 'undefined' && typeof ctor.requestPermission === 'function'
}

/**
 * Request motion + orientation access.
 *
 * MUST be invoked synchronously from a user gesture handler on iOS, otherwise
 * Safari rejects it without showing the prompt.
 *
 * @returns {Promise<SensorPermission>}
 */
export async function requestMotionPermission() {
  const DME = /** @type {any} */ (globalThis).DeviceMotionEvent
  const DOE = /** @type {any} */ (globalThis).DeviceOrientationEvent

  if (typeof DME === 'undefined' && typeof DOE === 'undefined') return 'unsupported'

  const requests = []
  if (needsExplicitGrant(DME)) requests.push(DME.requestPermission())
  if (needsExplicitGrant(DOE)) requests.push(DOE.requestPermission())

  // No gate (Android / desktop) — sensors are already available.
  if (requests.length === 0) return 'granted'

  try {
    const results = await Promise.all(requests)
    return results.every((r) => r === 'granted') ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/**
 * Whether this device can plausibly support pedestrian dead reckoning.
 * Desktop browsers expose the events but never fire them with real data.
 * @returns {boolean}
 */
export function motionSensorsLikelyAvailable() {
  if (typeof globalThis.DeviceMotionEvent === 'undefined') return false
  // Coarse mobile heuristic: touch capability + a pointer that isn't a mouse.
  const coarse =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(pointer: coarse)').matches
  return coarse
}
