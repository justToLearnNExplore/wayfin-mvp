/**
 * @file Pedestrian dead-reckoning tracker — the live-position brain.
 *
 * Responsibilities:
 *   • hold the current best estimate of where the user is (map units + floor),
 *   • advance that estimate one stride per detected step, along the compass
 *     heading,
 *   • model how wrong it is likely to be (uncertainty grows with distance),
 *   • accept re-anchors from vision / voice / text without restarting nav,
 *   • optionally map-match the estimate onto the active route polyline.
 *
 * DESIGN NOTE — honesty over illusion. Dead reckoning drifts, unavoidably,
 * because no browser exposes an absolute indoor position. Rather than hide
 * that, we track an explicit uncertainty radius that GROWS as you walk and
 * SHRINKS when you re-anchor. The UI renders it as a halo, so the user always
 * knows how much to trust the dot — and knows when to re-scan a landmark.
 *
 * The routing engine is never consulted or modified here: this module only
 * answers "where am I", never "which way should I go".
 */

import {
  DEFAULT_STEP_METRES,
  advance,
  clampToMap,
  distanceMetres,
  smoothPoint,
} from './geometry.js'
import { strideFromCadence } from '../sensors/pedometer.js'

/** Fraction of distance travelled that accumulates as positional error. */
const DRIFT_RATE = 0.08

/** Uncertainty (m) below which we consider the fix "good". */
const GOOD_FIX_METRES = 6

/**
 * Uncertainty (m) beyond which the UI should prompt a re-scan.
 *
 * Tuned to the venue, not picked arbitrarily: adjacent shopfronts on this map
 * sit 12–36 m apart (H&M→NIKE is 12 m). Once the halo exceeds ~12 m the dot
 * can no longer disambiguate neighbouring stores, which is precisely when the
 * user should re-anchor. With a 4 m vision fix and 8 % drift this triggers
 * after roughly 100 m of walking — a natural QR-checkpoint spacing.
 */
export const RE_ANCHOR_METRES = 12

/**
 * How precise each anchor source is, in metres. Vision recognising a store
 * front puts you at that shopfront; a manual tap is as good as the user's
 * own knowledge.
 * @type {Record<AnchorSource, number>}
 */
const SOURCE_BASE_UNCERTAINTY = {
  vision: 4,
  manual: 3,
  voice: 5,
  text: 5,
  qr: 1.5,
}

/**
 * @typedef {'vision' | 'manual' | 'voice' | 'text' | 'qr'} AnchorSource
 */

/**
 * @typedef {Object} Anchor
 * @property {number} x
 * @property {number} y
 * @property {string} floor
 * @property {AnchorSource} source
 * @property {string} [label]       Human name of the landmark, for the UI.
 * @property {number} [confidence]  0..1 from the recogniser, if any.
 */

/**
 * @typedef {Object} TrackerState
 * @property {number} x
 * @property {number} y
 * @property {string} floor
 * @property {number} headingDeg        Map-frame bearing, clockwise from up.
 * @property {number} uncertaintyMetres Radius of the accuracy halo.
 * @property {number} confidence        0..1, derived from uncertainty.
 * @property {boolean} isLocalized      False until the first anchor lands.
 * @property {boolean} needsReAnchor    True once drift exceeds the threshold.
 * @property {number} steps             Steps since the last anchor.
 * @property {number} metresTravelled   Distance since the last anchor.
 * @property {string | null} anchorLabel
 */

export class LocalizationTracker {
  /**
   * @param {Object} [options]
   * @param {number} [options.stepMetres] Fallback stride length.
   * @param {boolean} [options.adaptiveStride] Scale stride with cadence.
   * @param {number} [options.displayAlpha] Render smoothing 0..1.
   */
  constructor(options = {}) {
    /** @private */
    this.cfg = {
      stepMetres: options.stepMetres ?? DEFAULT_STEP_METRES,
      adaptiveStride: options.adaptiveStride ?? true,
      displayAlpha: options.displayAlpha ?? 0.22,
    }

    /** @private True position estimate (unsmoothed). */
    this.estimate = { x: 50, y: 50 }
    /** @private Smoothed position for rendering only. */
    this.display = { x: 50, y: 50 }
    /** @private */ this.floor = 'G'
    /** @private */ this.headingDeg = 0
    /** @private */ this.baseUncertainty = Infinity
    /** @private */ this.metresTravelled = 0
    /** @private */ this.steps = 0
    /** @private */ this.localized = false
    /** @private @type {string | null} */ this.anchorLabel = null
    /** @private @type {{x:number,y:number}[] | null} */ this.routePath = null
  }

  /**
   * Re-anchor the estimate to a known landmark.
   *
   * This is the drift-correction entry point. Navigation is NOT restarted —
   * we only teleport the underlying estimate and reset the error budget; the
   * rendered dot glides there via display smoothing.
   *
   * @param {Anchor} anchor
   */
  anchor(anchor) {
    this.estimate = { x: anchor.x, y: anchor.y }
    if (!this.localized) this.display = { x: anchor.x, y: anchor.y }
    this.floor = anchor.floor

    const base = SOURCE_BASE_UNCERTAINTY[anchor.source] ?? 6
    // A hesitant recogniser widens the halo proportionally.
    const conf = anchor.confidence ?? 1
    this.baseUncertainty = base / Math.max(0.35, conf)

    this.metresTravelled = 0
    this.steps = 0
    this.localized = true
    this.anchorLabel = anchor.label ?? null
  }

  /**
   * Constrain the estimate to an active route polyline (map matching).
   *
   * Corridors are narrow and people follow them, so projecting onto the route
   * removes most lateral drift. Pass null to free-run.
   *
   * @param {{x:number,y:number}[] | null} path Same-floor route points.
   */
  setRoutePath(path) {
    this.routePath = path && path.length > 1 ? path : null
  }

  /** @param {number} headingDeg Map-frame bearing, clockwise from map-up. */
  setHeading(headingDeg) {
    this.headingDeg = headingDeg
  }

  /** @param {string} floor */
  setFloor(floor) {
    if (floor === this.floor) return
    this.floor = floor
    // A floor change means we're at the escalator/lift landing, which is a
    // known point — but we don't know where, so widen rather than reset.
    this.baseUncertainty = Math.max(this.baseUncertainty, 8)
  }

  /**
   * Advance the estimate by one footfall.
   * @param {number} [cadenceHz] Live cadence, enabling adaptive stride.
   * @returns {void}
   */
  step(cadenceHz = 0) {
    if (!this.localized) return

    const stride = this.cfg.adaptiveStride
      ? strideFromCadence(cadenceHz, this.cfg.stepMetres)
      : this.cfg.stepMetres

    const next = clampToMap(advance(this.estimate, this.headingDeg, stride))
    this.estimate = this.routePath ? projectOntoPath(next, this.routePath) : next

    this.steps += 1
    this.metresTravelled += stride
  }

  /**
   * Advance the render-smoothed position toward the true estimate.
   * Call once per animation frame for a dot that glides rather than jumps.
   * @returns {{x:number, y:number}}
   */
  tickDisplay() {
    this.display = smoothPoint(this.display, this.estimate, this.cfg.displayAlpha)
    return this.display
  }

  /** @returns {number} Current 1-sigma-ish error radius in metres. */
  uncertaintyMetres() {
    if (!this.localized) return Infinity
    return this.baseUncertainty + DRIFT_RATE * this.metresTravelled
  }

  /** @returns {TrackerState} */
  getState() {
    const uncertainty = this.uncertaintyMetres()
    // Confidence is anchored to two meaningful points: 1.0 at a "good" fix,
    // and 0.4 at the re-anchor threshold, decaying linearly beyond it.
    const spread = Math.max(1, RE_ANCHOR_METRES - GOOD_FIX_METRES)
    const confidence = this.localized
      ? Math.max(0, Math.min(1, 1 - ((uncertainty - GOOD_FIX_METRES) / spread) * 0.6))
      : 0

    return {
      x: this.display.x,
      y: this.display.y,
      floor: this.floor,
      headingDeg: this.headingDeg,
      uncertaintyMetres: uncertainty,
      confidence: this.localized ? Math.max(confidence, 0.05) : 0,
      isLocalized: this.localized,
      needsReAnchor: this.localized && uncertainty > RE_ANCHOR_METRES,
      steps: this.steps,
      metresTravelled: this.metresTravelled,
      anchorLabel: this.anchorLabel,
    }
  }
}

/**
 * Project a point onto the nearest segment of a polyline (map matching).
 *
 * Exported for unit testing — this is the piece most likely to hide an
 * off-by-one or a divide-by-zero on degenerate segments.
 *
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}[]} path
 * @returns {{x:number,y:number}}
 */
export function projectOntoPath(point, path) {
  let best = path[0]
  let bestDist = Infinity

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const lenSq = vx * vx + vy * vy

    // Degenerate segment (duplicate points) — fall back to the vertex.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / lenSq))
    const candidate = { x: a.x + vx * t, y: a.y + vy * t }
    const dist = distanceMetres(point, candidate)

    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }

  return best
}
