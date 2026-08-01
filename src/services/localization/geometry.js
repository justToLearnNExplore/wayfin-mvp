/**
 * @file Coordinate math shared by every localization consumer.
 *
 * The mall map uses a normalised 0..100 grid on both axes, but the axes have
 * DIFFERENT real-world scales (see routing.js): one x-unit is 2 m while one
 * y-unit is 0.4 m. That asymmetry is the single most common source of bugs in
 * this layer — a bearing computed naively in unit-space is not a real-world
 * bearing, so dead reckoning would veer badly off course.
 *
 * Rule enforced here: all angles and distances are computed in METRE-space.
 * Callers work in map units; this module converts at the boundary.
 */

import { X_METERS, Y_METERS } from '../../lib/routing.js'

/**
 * A position on the mall map.
 * @typedef {Object} MapPoint
 * @property {number} x  Map units along the mall's long axis (0..100).
 * @property {number} y  Map units across the mall's depth (0..100).
 */

/**
 * A localized position: a point plus the floor it sits on.
 * @typedef {Object} FloorPoint
 * @property {number} x
 * @property {number} y
 * @property {string} floor  Floor id, e.g. 'G' | 'UG' | 'F1' | 'P2'.
 */

/** Metres travelled per detected step, tuned for average adult stride. */
export const DEFAULT_STEP_METRES = 0.7

/**
 * Bearing convention used throughout wayFin:
 *   0°   = map "up"    (decreasing y)
 *   90°  = map "right" (increasing x)
 *   180° = map "down"  (increasing y)
 *   270° = map "left"  (decreasing x)
 * Angles increase clockwise, matching compass semantics.
 */

/**
 * Normalise any angle into [0, 360).
 * @param {number} deg
 * @returns {number}
 */
export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360
}

/**
 * Smallest signed rotation from `from` to `to`, in (-180, 180].
 * Used for smoothing headings across the 0/360 wrap without spinning.
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function angleDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * Circular exponential moving average for headings.
 * Interpolates along the shortest arc so 359° → 1° moves +2°, not -358°.
 * @param {number} prevDeg
 * @param {number} nextDeg
 * @param {number} alpha Smoothing factor 0..1 (higher = more responsive).
 * @returns {number}
 */
export function smoothHeading(prevDeg, nextDeg, alpha) {
  return normalizeDeg(prevDeg + angleDelta(prevDeg, nextDeg) * alpha)
}

/**
 * Convert a displacement in metres into map units.
 * @param {number} dxMetres
 * @param {number} dyMetres
 * @returns {{dx: number, dy: number}}
 */
export function metresToUnits(dxMetres, dyMetres) {
  return { dx: dxMetres / X_METERS, dy: dyMetres / Y_METERS }
}

/**
 * Convert a displacement in map units into metres.
 * @param {number} dx
 * @param {number} dy
 * @returns {{dxMetres: number, dyMetres: number}}
 */
export function unitsToMetres(dx, dy) {
  return { dxMetres: dx * X_METERS, dyMetres: dy * Y_METERS }
}

/**
 * Straight-line distance between two map points, in metres.
 * @param {MapPoint} a
 * @param {MapPoint} b
 * @returns {number}
 */
export function distanceMetres(a, b) {
  const { dxMetres, dyMetres } = unitsToMetres(b.x - a.x, b.y - a.y)
  return Math.hypot(dxMetres, dyMetres)
}

/**
 * True real-world bearing from `a` to `b`, in degrees clockwise from map-up.
 * Computed in metre-space — see the file header for why that matters.
 * @param {MapPoint} a
 * @param {MapPoint} b
 * @returns {number}
 */
export function bearingBetween(a, b) {
  const { dxMetres, dyMetres } = unitsToMetres(b.x - a.x, b.y - a.y)
  return normalizeDeg((Math.atan2(dxMetres, -dyMetres) * 180) / Math.PI)
}

/**
 * Advance a point by `metres` along `bearingDeg`.
 * This is the core dead-reckoning step: one call per detected footfall.
 * @param {MapPoint} point
 * @param {number} bearingDeg Degrees clockwise from map-up.
 * @param {number} metres
 * @returns {MapPoint}
 */
export function advance(point, bearingDeg, metres) {
  const rad = (bearingDeg * Math.PI) / 180
  const dxMetres = Math.sin(rad) * metres
  const dyMetres = -Math.cos(rad) * metres
  const { dx, dy } = metresToUnits(dxMetres, dyMetres)
  return { x: point.x + dx, y: point.y + dy }
}

/**
 * Clamp a point into the map's valid 0..100 grid, with a small margin so a
 * drifting estimate parks at the wall instead of flying off-canvas.
 * @param {MapPoint} point
 * @returns {MapPoint}
 */
export function clampToMap(point) {
  return {
    x: Math.max(-2, Math.min(102, point.x)),
    y: Math.max(-2, Math.min(102, point.y)),
  }
}

/**
 * Linear exponential moving average, used to smooth the *rendered* dot so it
 * glides instead of teleporting. The underlying estimate stays unsmoothed so
 * error never accumulates from display filtering.
 * @param {MapPoint} prev
 * @param {MapPoint} next
 * @param {number} alpha 0..1 (higher = snappier).
 * @returns {MapPoint}
 */
export function smoothPoint(prev, next, alpha) {
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  }
}
