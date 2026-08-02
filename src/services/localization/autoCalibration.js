/**
 * @file Automatic map-north calibration.
 *
 * THE PROBLEM: the compass reports degrees clockwise from magnetic north, but
 * our map has its own arbitrary "up". Rotating the map needs the angle between
 * the two — a per-venue constant nobody wants to survey by hand.
 *
 * THE TRICK: we already learn it for free. Every time the user confirms two
 * positions in a row (camera scan, spoken landmark, manual pick), we know the
 * exact map bearing they just walked. Averaging the compass over that same walk
 * gives the same direction in compass degrees. The difference is the offset:
 *
 *     northOffset = compassBearingWalked − mapBearingWalked
 *
 * No survey, no user calibration step, and it works in any venue — which
 * matters far more than getting Orion right, because it means onboarding a new
 * mall never requires a site visit for orientation.
 *
 * Estimates accumulate as a circular running mean, so accuracy improves with
 * every leg walked, and a single bad reading can't poison it.
 */

/** Minimum straight-line distance for a leg to be worth calibrating from. */
const MIN_LEG_METRES = 12

/** Minimum compass samples required across the leg. */
const MIN_SAMPLES = 8

/**
 * Maximum circular spread (degrees) allowed in the compass samples. A walk
 * around a corner produces a wide spread and must not be used — we can only
 * calibrate from a reasonably straight leg.
 */
const MAX_SPREAD_DEG = 50

/** Below this confidence we keep the map north-up rather than rotate it wrongly. */
export const MIN_USABLE_CONFIDENCE = 0.45

/** @typedef {{x: number, y: number, floor: string}} Point */

/**
 * Bearing between two map points, in degrees clockwise from map-up (−y).
 * @param {Point} from
 * @param {Point} to
 * @returns {number} 0..360
 */
export function mapBearingBetween(from, to) {
  const deg = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI
  return (deg + 360) % 360
}

/**
 * Circular mean of angles in degrees — a plain average is wrong across the
 * 0/360 seam (mean of 350 and 10 must be 0, not 180).
 * @param {number[]} anglesDeg
 * @returns {{mean: number, spread: number}} spread is 0 (tight) .. 180 (random)
 */
export function circularMean(anglesDeg) {
  if (anglesDeg.length === 0) return { mean: 0, spread: 180 }
  let sx = 0
  let sy = 0
  for (const a of anglesDeg) {
    const r = (a * Math.PI) / 180
    sx += Math.cos(r)
    sy += Math.sin(r)
  }
  const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360
  // Resultant length R: 1 = perfectly aligned, 0 = uniformly scattered.
  const R = Math.hypot(sx, sy) / anglesDeg.length
  const spread = (1 - R) * 180
  return { mean, spread }
}

/**
 * Accumulates north-offset observations across a session.
 */
export class NorthCalibrator {
  constructor() {
    /** @private Unit vectors of accepted offsets, for a circular running mean. */
    this.sumX = 0
    /** @private */
    this.sumY = 0
    /** @private */
    this.samples = 0
    /** @private Compass readings since the last anchor. */
    this.compassSamples = /** @type {number[]} */ ([])
    /** @private @type {Point | null} */
    this.legStart = null
  }

  /**
   * Record a raw compass reading (degrees from magnetic north, NOT map frame).
   * @param {number} compassDeg
   */
  addCompassSample(compassDeg) {
    if (!Number.isFinite(compassDeg) || this.legStart === null) return
    this.compassSamples.push(compassDeg)
    // Bound memory on a long leg; the mean is stable well before this.
    if (this.compassSamples.length > 600) this.compassSamples.shift()
  }

  /**
   * Called on every confirmed position fix. Closes the previous leg (learning
   * from it if it qualifies) and opens a new one.
   *
   * @param {Point} anchor
   * @param {{metresTravelled?: number}} [context] Distance the tracker believes
   *   was walked since the last anchor; guards against a user who teleported by
   *   picking a far-away landmark without actually walking there.
   * @returns {{learned: boolean, offset?: number, reason?: string}}
   */
  onAnchor(anchor, context = {}) {
    const previous = this.legStart
    const samples = this.compassSamples
    this.legStart = { ...anchor }
    this.compassSamples = []

    if (!previous) return { learned: false, reason: 'first-anchor' }
    if (previous.floor !== anchor.floor) return { learned: false, reason: 'floor-change' }
    if (samples.length < MIN_SAMPLES) return { learned: false, reason: 'too-few-samples' }

    const legMetres = Math.hypot(
      (anchor.x - previous.x) * 2, // X_METERS
      (anchor.y - previous.y) * 0.4 // Y_METERS
    )
    if (legMetres < MIN_LEG_METRES) return { learned: false, reason: 'leg-too-short' }

    // If the pedometer saw far less movement than the anchors imply, the user
    // corrected a bad fix rather than walked — the compass trace is meaningless.
    if (context.metresTravelled != null && context.metresTravelled < legMetres * 0.5) {
      return { learned: false, reason: 'not-actually-walked' }
    }

    const { mean: compassBearing, spread } = circularMean(samples)
    if (spread > MAX_SPREAD_DEG) return { learned: false, reason: 'path-not-straight' }

    const mapBearing = mapBearingBetween(previous, anchor)
    const offset = (compassBearing - mapBearing + 360) % 360

    // Accumulate as a unit vector so the running mean is circular-safe.
    const r = (offset * Math.PI) / 180
    this.sumX += Math.cos(r)
    this.sumY += Math.sin(r)
    this.samples += 1

    return { learned: true, offset }
  }

  /**
   * Best estimate so far.
   * @returns {{offset: number, confidence: number, samples: number}}
   *   confidence 0..1; below {@link MIN_USABLE_CONFIDENCE} the caller should
   *   keep the map north-up rather than rotate it on a guess.
   */
  getEstimate() {
    if (this.samples === 0) return { offset: 0, confidence: 0, samples: 0 }
    const offset = ((Math.atan2(this.sumY, this.sumX) * 180) / Math.PI + 360) % 360
    // Agreement between observations…
    const agreement = Math.hypot(this.sumX, this.sumY) / this.samples
    // …tempered by how many we have (one lucky reading is not confidence).
    const volume = Math.min(1, this.samples / 3)
    return { offset, confidence: agreement * volume, samples: this.samples }
  }

  reset() {
    this.sumX = 0
    this.sumY = 0
    this.samples = 0
    this.compassSamples = []
    this.legStart = null
  }
}
