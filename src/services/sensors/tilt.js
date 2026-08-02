/**
 * @file Device tilt — "is the rear camera actually looking at the mall?"
 *
 * Auto re-localization is only worth attempting when the camera can see a
 * shopfront. A phone lying flat in a hand, face-up on a table, or swinging in
 * a pocket photographs the ceiling, the user's chin, or the inside of a coat,
 * and every one of those frames costs a vision call to be told nothing.
 *
 * `DeviceOrientationEvent.beta` is the front-to-back tilt in degrees:
 *
 *     beta ≈   0   phone flat, screen up      → rear camera points at the floor
 *     beta ≈  90   phone upright in portrait  → rear camera points ahead  ✓
 *     beta ≈ 180   phone flat, screen down    → rear camera points at the ceiling
 *
 * `gamma` is the left-right roll; a heavy roll means the frame is sideways,
 * which both hurts OCR and usually means the phone is being pocketed.
 *
 * The decision function is pure and exported separately from the listener so
 * the thresholds can be tested without a browser or a physical device.
 */

/** Tilt range (degrees of `beta`) in which the rear camera faces roughly ahead. */
export const MIN_FORWARD_BETA = 55
export const MAX_FORWARD_BETA = 125

/** Maximum absolute roll (`gamma`) before the frame is too sideways to use. */
export const MAX_FORWARD_GAMMA = 45

/**
 * Is the rear camera pointing roughly forward at the world?
 *
 * @param {number | null | undefined} beta  Front-to-back tilt in degrees.
 * @param {number | null | undefined} gamma Left-right roll in degrees.
 * @returns {boolean} False whenever the reading is missing — we would rather
 *   skip a scan than spend an API call on a photo of someone's pocket.
 */
export function cameraFacingForward(beta, gamma) {
  if (typeof beta !== 'number' || Number.isNaN(beta)) return false
  if (beta < MIN_FORWARD_BETA || beta > MAX_FORWARD_BETA) return false

  // Roll is allowed to be missing (some Androids omit gamma); only reject a
  // roll we can actually see to be excessive.
  if (typeof gamma === 'number' && !Number.isNaN(gamma)) {
    if (Math.abs(gamma) > MAX_FORWARD_GAMMA) return false
  }
  return true
}

/**
 * @typedef {Object} TiltSensor
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => boolean} facingForward Latest verdict; false until a reading.
 * @property {() => {beta: number | null, gamma: number | null}} raw
 */

/**
 * Watch device tilt.
 *
 * Registers on plain `deviceorientation` (not the `absolute` variant): tilt is
 * relative to gravity and needs no compass reference, so this works even where
 * the magnetometer does not.
 *
 * @returns {TiltSensor}
 */
export function createTiltSensor() {
  /** @type {number | null} */ let beta = null
  /** @type {number | null} */ let gamma = null

  /** @param {DeviceOrientationEvent} event */
  const handle = (event) => {
    beta = event.beta
    gamma = event.gamma
  }

  return {
    start() {
      globalThis.addEventListener('deviceorientation', handle)
    },
    stop() {
      globalThis.removeEventListener('deviceorientation', handle)
      beta = null
      gamma = null
    },
    facingForward: () => cameraFacingForward(beta, gamma),
    raw: () => ({ beta, gamma }),
  }
}
