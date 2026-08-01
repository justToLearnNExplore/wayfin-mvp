/**
 * @file Step detection from raw accelerometer samples.
 *
 * Approach: the accelerometer magnitude |a| sits at ~9.81 m/s² at rest. Walking
 * adds a roughly sinusoidal oscillation on top of it (heel-strike spikes). We
 * therefore:
 *   1. track gravity with a slow low-pass filter,
 *   2. subtract it to get the dynamic component,
 *   3. lightly smooth that to kill sensor noise,
 *   4. run a hysteresis peak detector with a refractory period.
 *
 * Hysteresis (separate rise/fall thresholds) prevents a single noisy footfall
 * from registering as several steps, and the refractory period caps cadence at
 * a physically plausible rate.
 *
 * `StepDetector` is deliberately pure — it takes numbers, returns booleans — so
 * it can be unit-tested against synthetic gait signals with no browser.
 */

/**
 * @typedef {Object} StepDetectorOptions
 * @property {number} [riseThreshold]  m/s² above baseline that opens a step.
 * @property {number} [fallThreshold]  m/s² that closes/commits it.
 * @property {number} [minStepMs]      Refractory period between steps.
 * @property {number} [maxCadenceHz]   Upper bound on reported cadence.
 * @property {number} [gravityAlpha]   Low-pass factor tracking gravity.
 * @property {number} [signalAlpha]    Low-pass factor smoothing the signal.
 */

/**
 * Every option resolved to a concrete value — what the detector actually runs
 * on after defaults are applied.
 * @typedef {Required<StepDetectorOptions>} ResolvedStepConfig
 */

/** @type {ResolvedStepConfig} */
const DEFAULTS = {
  riseThreshold: 1.1,
  fallThreshold: 0.35,
  minStepMs: 260,
  maxCadenceHz: 4,
  gravityAlpha: 0.02,
  signalAlpha: 0.28,
}

export class StepDetector {
  /** @param {StepDetectorOptions} [options] */
  constructor(options = {}) {
    /** @private @type {ResolvedStepConfig} */
    this.cfg = { ...DEFAULTS, ...options }
    this.reset()
  }

  /** Clear all filter state. Call when re-anchoring or restarting tracking. */
  reset() {
    /** @private @type {number} Running gravity estimate (m/s²). */
    this.gravity = 9.81
    /** @private @type {number} Smoothed dynamic acceleration. */
    this.signal = 0
    /** @private @type {boolean} Peak detector armed (rising edge seen). */
    this.armed = false
    /** @private @type {number} */
    this.lastStepAt = 0
    /** @private @type {boolean} Gravity baseline seeded from first sample. */
    this.primed = false
    /** @type {number} Total steps counted since the last reset. */
    this.steps = 0
    /** @type {number} Most recent cadence in steps/second (0 when idle). */
    this.cadenceHz = 0
  }

  /**
   * Feed one accelerometer sample.
   * @param {number} magnitude  |acceleration including gravity| in m/s².
   * @param {number} timestampMs  Monotonic-ish timestamp (performance.now()).
   * @returns {boolean} true if this sample completed a step.
   */
  push(magnitude, timestampMs) {
    if (!Number.isFinite(magnitude)) return false

    // Seed the gravity estimate on the first sample so we don't spend the
    // first second of walking climbing from 9.81 to the true baseline.
    if (!this.primed) {
      this.gravity = magnitude
      this.primed = true
      this.lastStepAt = timestampMs
      return false
    }

    const { gravityAlpha, signalAlpha, riseThreshold, fallThreshold, minStepMs } = this.cfg

    // 1 + 2: track gravity slowly, subtract to isolate motion.
    this.gravity += (magnitude - this.gravity) * gravityAlpha
    const dynamic = magnitude - this.gravity

    // 3: smooth the dynamic component.
    this.signal += (dynamic - this.signal) * signalAlpha

    // 4: hysteresis peak detection.
    if (!this.armed) {
      if (this.signal > riseThreshold) this.armed = true
      return false
    }

    if (this.signal > fallThreshold) return false

    // Falling edge — a footfall completed. Enforce the refractory period.
    this.armed = false
    const elapsed = timestampMs - this.lastStepAt
    if (elapsed < minStepMs) return false

    this.cadenceHz = elapsed > 0 ? Math.min(this.cfg.maxCadenceHz, 1000 / elapsed) : 0
    this.lastStepAt = timestampMs
    this.steps += 1
    return true
  }
}

/**
 * @typedef {Object} Pedometer
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => number} stepCount
 */

/**
 * Wire a {@link StepDetector} to the browser's devicemotion stream.
 *
 * Note we use `accelerationIncludingGravity`: Android frequently reports
 * `acceleration` (gravity-compensated) as null, whereas the with-gravity
 * reading is reliable everywhere. We remove gravity ourselves.
 *
 * @param {(info: {steps: number, cadenceHz: number}) => void} onStep
 * @param {StepDetectorOptions} [options]
 * @returns {Pedometer}
 */
export function createPedometer(onStep, options) {
  const detector = new StepDetector(options)

  /** @param {DeviceMotionEvent} event */
  const handle = (event) => {
    const a = event.accelerationIncludingGravity
    if (!a || a.x == null || a.y == null || a.z == null) return
    const magnitude = Math.hypot(a.x, a.y, a.z)
    if (detector.push(magnitude, performance.now())) {
      onStep({ steps: detector.steps, cadenceHz: detector.cadenceHz })
    }
  }

  return {
    start() {
      detector.reset()
      globalThis.addEventListener('devicemotion', handle)
    },
    stop() {
      globalThis.removeEventListener('devicemotion', handle)
    },
    stepCount: () => detector.steps,
  }
}

/**
 * Stride length from cadence (Weinberg-style approximation).
 *
 * People take longer strides when walking faster, so a fixed 0.7 m
 * over/under-shoots at the extremes. Clamped to a sane human range.
 *
 * @param {number} cadenceHz Steps per second.
 * @param {number} [baseMetres] Stride at a typical ~1.8 steps/s.
 * @returns {number} Estimated stride in metres.
 */
export function strideFromCadence(cadenceHz, baseMetres = 0.7) {
  if (!cadenceHz) return baseMetres
  const scaled = baseMetres * (0.75 + 0.25 * (cadenceHz / 1.8))
  return Math.max(0.45, Math.min(0.95, scaled))
}
