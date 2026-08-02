/**
 * @file React binding for the localization stack.
 *
 * Owns the lifecycle of the sensors (pedometer + compass) and the
 * {@link LocalizationTracker}, and republishes their state into React at a
 * fixed ~15 Hz. That cadence is deliberate: the underlying estimate updates
 * per-footfall and the render smoothing runs per animation frame, but pushing
 * 60 Hz through React state would re-render the whole map tree for sub-pixel
 * movement. 15 Hz is indistinguishable to the eye for a gliding dot and keeps
 * the main thread free for the 3D transforms.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocalizationTracker } from './tracker.js'
import { createPedometer } from '../sensors/pedometer.js'
import { createCompass } from '../sensors/heading.js'
import { requestMotionPermission, motionSensorsLikelyAvailable } from '../sensors/permissions.js'
import { NorthCalibrator, MIN_USABLE_CONFIDENCE } from './autoCalibration.js'

/** React state publish rate, in Hz. */
const PUBLISH_HZ = 15

/**
 * @typedef {import('./tracker.js').Anchor} Anchor
 * @typedef {import('./tracker.js').TrackerState} TrackerState
 */

/**
 * @typedef {Object} LocalizationApi
 * @property {TrackerState} state            Live tracker state (~15 Hz).
 * @property {(anchor: Anchor) => void} anchor  Drop/refresh the position fix.
 * @property {(path: {x:number,y:number}[] | null) => void} setRoutePath
 * @property {(floor: string) => void} setFloor
 * @property {() => Promise<boolean>} startTracking  Call from a user gesture.
 * @property {() => void} stopTracking
 * @property {boolean} isTracking
 * @property {'idle'|'granted'|'denied'|'unsupported'} permission
 * @property {boolean} sensorsAvailable
 * @property {(actualMapBearing: number) => void} calibrateHeading
 * @property {{offset:number, confidence:number, samples:number, usable:boolean}} heading
 *   Auto-learned north offset. `usable` is false until enough agreeing legs
 *   have been walked, and the map must stay north-up while it is.
 * @property {() => {cadenceHz: number, msSinceLastStep: number}} getMotion
 *   Current gait, polled rather than published — see `motionRef`.
 */

/**
 * @param {Object} [options]
 * @param {number} [options.stepMetres]
 * @returns {LocalizationApi}
 */
export function useLocalization(options = {}) {
  const trackerRef = useRef(/** @type {LocalizationTracker | null} */ (null))
  if (!trackerRef.current) {
    trackerRef.current = new LocalizationTracker({ stepMetres: options.stepMetres })
  }
  const tracker = trackerRef.current

  const pedometerRef = useRef(/** @type {ReturnType<typeof createPedometer> | null} */ (null))
  const compassRef = useRef(/** @type {ReturnType<typeof createCompass> | null} */ (null))
  const rafRef = useRef(0)

  /**
   * Learns the map/compass north offset from the legs the user walks between
   * confirmed fixes, removing the need for a per-venue survey.
   */
  const calibratorRef = useRef(/** @type {NorthCalibrator | null} */ (null))
  if (!calibratorRef.current) calibratorRef.current = new NorthCalibrator()
  const calibrator = calibratorRef.current

  /**
   * Live gait, held in a ref rather than state on purpose. Consumers poll it
   * (the auto-relocalization gate does, every couple of seconds); publishing
   * cadence through React would re-render the map on every footfall for a
   * value nothing draws.
   */
  const motionRef = useRef({ cadenceHz: 0, lastStepAt: 0 })

  const [state, setState] = useState(() => tracker.getState())
  const [heading, setHeadingState] = useState(
    /** @type {{offset: number, confidence: number, samples: number, usable: boolean}} */
    ({ offset: 0, confidence: 0, samples: 0, usable: false })
  )
  const [isTracking, setIsTracking] = useState(false)
  const [permission, setPermission] = useState(
    /** @type {'idle'|'granted'|'denied'|'unsupported'} */ ('idle')
  )

  const sensorsAvailable = useMemo(() => motionSensorsLikelyAvailable(), [])

  /** Drive display smoothing every frame; publish to React at PUBLISH_HZ. */
  const startRenderLoop = useCallback(() => {
    const interval = 1000 / PUBLISH_HZ
    let lastPublish = 0

    const frame = (/** @type {number} */ now) => {
      tracker.tickDisplay()
      if (now - lastPublish >= interval) {
        lastPublish = now
        setState(tracker.getState())
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [tracker])

  /**
   * Begin sensor tracking. MUST be called from a user gesture on iOS so the
   * motion-permission prompt is allowed to appear.
   * @returns {Promise<boolean>} whether tracking actually started.
   */
  const startTracking = useCallback(async () => {
    if (pedometerRef.current) return true

    const result = await requestMotionPermission()
    setPermission(result)
    if (result === 'denied') return false

    // Even when sensors are unavailable (desktop), we still run the render
    // loop so an anchored dot renders — it simply won't move on its own.
    if (result === 'granted') {
      const pedometer = createPedometer(({ cadenceHz }) => {
        motionRef.current = { cadenceHz, lastStepAt: performance.now() }
        tracker.step(cadenceHz)
      })
      const compass = createCompass((mapBearing) => tracker.setHeading(mapBearing), {
        onRawCompass: (raw) => calibrator.addCompassSample(raw),
      })
      pedometer.start()
      compass.start()
      pedometerRef.current = pedometer
      compassRef.current = compass
    }

    startRenderLoop()
    setIsTracking(true)
    return result === 'granted'
  }, [tracker, startRenderLoop])

  const stopTracking = useCallback(() => {
    pedometerRef.current?.stop()
    compassRef.current?.stop()
    pedometerRef.current = null
    compassRef.current = null
    cancelAnimationFrame(rafRef.current)
    setIsTracking(false)
  }, [])

  // Tear down on unmount so sensor listeners never outlive the screen.
  useEffect(() => () => {
    pedometerRef.current?.stop()
    compassRef.current?.stop()
    cancelAnimationFrame(rafRef.current)
  }, [])

  const anchor = useCallback(
    (/** @type {Anchor} */ a) => {
      // Close the leg walked since the last fix. If it was long enough and
      // straight enough, we just learned something about the venue's
      // orientation for free — no survey, no calibration step for the user.
      const before = tracker.getState()
      const result = calibrator.onAnchor(a, { metresTravelled: before.metresTravelled })

      tracker.anchor(a)
      setState(tracker.getState())

      if (result.learned) {
        const estimate = calibrator.getEstimate()
        const usable = estimate.confidence >= MIN_USABLE_CONFIDENCE
        // Only push a learned offset into the compass once we actually trust
        // it; until then the map stays north-up rather than rotating wrongly.
        if (usable) compassRef.current?.setNorthOffset(estimate.offset)
        setHeadingState({ ...estimate, usable })
      }
    },
    [tracker, calibrator]
  )

  const setRoutePath = useCallback(
    (/** @type {{x:number,y:number}[] | null} */ path) => tracker.setRoutePath(path),
    [tracker]
  )

  const setFloor = useCallback(
    (/** @type {string} */ floor) => {
      tracker.setFloor(floor)
      setState(tracker.getState())
    },
    [tracker]
  )

  const calibrateHeading = useCallback(
    (/** @type {number} */ actualMapBearing) => compassRef.current?.calibrate(actualMapBearing),
    []
  )

  /**
   * Current gait. Cadence decays to 0 once the steps stop, so a phone sitting
   * still does not look like it is mid-stride to anything polling this.
   */
  const getMotion = useCallback(() => {
    const { cadenceHz, lastStepAt } = motionRef.current
    const sinceStep = performance.now() - lastStepAt
    return { cadenceHz: sinceStep > 1500 ? 0 : cadenceHz, msSinceLastStep: sinceStep }
  }, [])

  return {
    state,
    anchor,
    setRoutePath,
    setFloor,
    startTracking,
    stopTracking,
    isTracking,
    permission,
    sensorsAvailable,
    calibrateHeading,
    /** Auto-learned map-north estimate; `usable` gates heading-up rotation. */
    heading,
    getMotion,
  }
}
