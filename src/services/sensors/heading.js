/**
 * @file Compass heading, normalised across platforms and aligned to the map.
 *
 * Three separate corrections are needed before a raw sensor reading can rotate
 * our map:
 *
 * 1. PLATFORM. iOS exposes `webkitCompassHeading` (degrees clockwise from true
 *    north — exactly what we want). Android exposes `alpha` on the
 *    `deviceorientationabsolute` event, measured COUNTER-clockwise, so heading
 *    is `360 - alpha`.
 * 2. SCREEN ROTATION. Sensor angles are reported in the device's native frame.
 *    If the user rotates to landscape we must add the screen angle back.
 * 3. MAP ALIGNMENT. The compass points at true north; our map's "up" is the
 *    mall's own axis. `mapNorthOffset` is the compass bearing that runs along
 *    map-up, and it is a per-venue survey constant.
 *
 * Indoor magnetometers are noisy (steel, escalators, speakers), so we smooth
 * along the shortest arc and expose a `calibrate()` escape hatch that lets the
 * user re-align by facing a known direction.
 */

import { normalizeDeg, smoothHeading } from '../localization/geometry.js'

/**
 * Starting assumption for the compass bearing that points along map-up.
 *
 * Deliberately 0 (map-up == north) rather than a guessed venue value. A wrong
 * constant rotates the entire map confidently in the wrong direction, which is
 * strictly worse for a lost shopper than not rotating at all.
 *
 * The real figure is LEARNED AT RUNTIME by NorthCalibrator (see
 * ../localization/autoCalibration.js) from the legs the user walks between
 * confirmed fixes, and heading-up rotation stays disabled until that estimate
 * is trustworthy. This is what lets a new venue be onboarded without a site
 * survey. Either way it only affects map rotation — never the route itself.
 * @type {number}
 */
export const ORION_MAP_NORTH_OFFSET = 0

/**
 * Convert a true-north compass bearing into a map-frame bearing.
 * @param {number} compassDeg Degrees clockwise from true north.
 * @param {number} [mapNorthOffset]
 * @returns {number} Degrees clockwise from map-up.
 */
export function mapBearingFromCompass(compassDeg, mapNorthOffset = ORION_MAP_NORTH_OFFSET) {
  return normalizeDeg(compassDeg - mapNorthOffset)
}

/** Current screen rotation in degrees, 0 when upright. */
function screenAngle() {
  const orientation = /** @type {any} */ (globalThis.screen)?.orientation
  if (orientation && typeof orientation.angle === 'number') return orientation.angle
  const legacy = /** @type {any} */ (globalThis).orientation
  return typeof legacy === 'number' ? legacy : 0
}

/**
 * Extract a true-north heading from a DeviceOrientationEvent, or null when the
 * event carries no absolute reference (common on desktop and some Androids).
 * @param {DeviceOrientationEvent} event
 * @returns {number | null}
 */
export function headingFromEvent(event) {
  const anyEvent = /** @type {any} */ (event)

  // iOS: already clockwise from north, and already screen-corrected.
  if (typeof anyEvent.webkitCompassHeading === 'number' && !Number.isNaN(anyEvent.webkitCompassHeading)) {
    return normalizeDeg(anyEvent.webkitCompassHeading)
  }

  // Android/standard: alpha is counter-clockwise from north, device-frame.
  if (typeof event.alpha === 'number' && event.absolute !== false) {
    return normalizeDeg(360 - event.alpha + screenAngle())
  }

  return null
}

/**
 * @typedef {Object} CompassOptions
 * @property {number} [alpha] Smoothing factor 0..1 (default 0.18).
 * @property {number} [mapNorthOffset]
 * @property {(compassDeg: number) => void} [onRawCompass] Raw magnetic-north
 *   reading, emitted before map-frame conversion so the auto-calibrator can
 *   solve for the offset without it being pre-applied.
 */

/**
 * @typedef {Object} Compass
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => number} mapBearing  Latest smoothed map-frame bearing.
 * @property {() => boolean} hasFix     True once a real reading has arrived.
 * @property {(actualMapBearing: number) => void} calibrate
 * @property {(offsetDeg: number) => void} setNorthOffset Apply an auto-learned offset.
 * @property {() => number} rawCompass Latest raw magnetic-north reading.
 */

/**
 * Start listening to the compass.
 * @param {(mapBearingDeg: number) => void} onHeading
 * @param {CompassOptions} [options]
 * @returns {Compass}
 */
export function createCompass(onHeading, options = {}) {
  const alpha = options.alpha ?? 0.18
  let mapNorthOffset = options.mapNorthOffset ?? ORION_MAP_NORTH_OFFSET
  let smoothed = 0
  let seeded = false
  let lastCompass = 0

  /** @param {DeviceOrientationEvent} event */
  const handle = (event) => {
    const compass = headingFromEvent(event)
    if (compass == null) return
    lastCompass = compass
    // Raw magnetic-north reading, before any map-frame conversion. The
    // auto-calibrator needs this untouched: converting first would bake in
    // the very offset it is trying to solve for.
    options.onRawCompass?.(compass)

    const mapBearing = mapBearingFromCompass(compass, mapNorthOffset)
    smoothed = seeded ? smoothHeading(smoothed, mapBearing, alpha) : mapBearing
    seeded = true
    onHeading(smoothed)
  }

  return {
    start() {
      // `deviceorientationabsolute` is the true-north variant where available;
      // plain `deviceorientation` is the iOS path. Registering both is safe —
      // headingFromEvent ignores events without an absolute reference.
      globalThis.addEventListener('deviceorientationabsolute', handle)
      globalThis.addEventListener('deviceorientation', handle)
    },
    stop() {
      globalThis.removeEventListener('deviceorientationabsolute', handle)
      globalThis.removeEventListener('deviceorientation', handle)
    },
    mapBearing: () => smoothed,
    hasFix: () => seeded,
    /**
     * Re-align the map to reality: tell the compass what map-bearing the user
     * is ACTUALLY facing right now, and the north offset is solved for.
     * @param {number} actualMapBearing
     */
    calibrate(actualMapBearing) {
      mapNorthOffset = normalizeDeg(lastCompass - actualMapBearing)
      smoothed = actualMapBearing
      seeded = true
      onHeading(smoothed)
    },

    /**
     * Apply an offset learned by the auto-calibrator. Unlike `calibrate()`
     * this does not assume the user is facing any particular way — it just
     * swaps in a better constant and lets the next reading flow through.
     * @param {number} offsetDeg
     */
    setNorthOffset(offsetDeg) {
      mapNorthOffset = normalizeDeg(offsetDeg)
    },

    /** Latest raw compass reading, degrees from magnetic north. */
    rawCompass: () => lastCompass,
  }
}
