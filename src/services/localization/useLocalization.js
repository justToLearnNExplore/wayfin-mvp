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

  const [state, setState] = useState(() => tracker.getState())
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
      const pedometer = createPedometer(({ cadenceHz }) => tracker.step(cadenceHz))
      const compass = createCompass((mapBearing) => tracker.setHeading(mapBearing))
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
      tracker.anchor(a)
      setState(tracker.getState())
    },
    [tracker]
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
  }
}
