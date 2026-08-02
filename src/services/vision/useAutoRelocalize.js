/**
 * @file React binding for automatic camera re-localization.
 *
 * Owns the camera lifecycle, the tilt sensor and the scan loop; delegates
 * every actual decision to the pure policy in {@link ./autoRelocalizer.js} and
 * the pure triage in {@link ./frameQuality.js}, so the judgement calls stay
 * testable without a browser.
 *
 * THE CAMERA IS NOT HELD OPEN. A live MediaStream is the single largest
 * battery draw in this app, and holding one for a whole route to use it six
 * times would be indefensible. Instead each attempt opens the camera, waits
 * for the sensor to settle, grabs at most a few frames, and closes it again —
 * typically well under two seconds of camera-on time per attempt.
 *
 * TWO SEPARATE BUDGETS, because two different things are scarce:
 *   • `lastAttemptAt` rate-limits CAMERA OPENS   → protects the battery.
 *   • `scansUsed`     rate-limits UPLOADS        → protects the bill.
 * An attempt that opens the camera and rejects every frame locally costs
 * battery but no money, and is accounted for accordingly.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { openRearCamera, closeCamera, captureFrame, captureImageData } from './camera.js'
import { localizeFromImage } from './localizer.js'
import { scoreFrame } from './frameQuality.js'
import { shouldAttemptScan, classifyResult } from './autoRelocalizer.js'
import { createTiltSensor } from '../sensors/tilt.js'

/** How often the (cheap, local) gate is evaluated. */
const GATE_POLL_MS = 2000

/** Frames to try per attempt before giving up and closing the camera. */
const FRAMES_PER_ATTEMPT = 3

/** Delay between those frames — long enough for autofocus and a new pose. */
const FRAME_SPACING_MS = 450

/** Grace period after opening the camera before the first grab. */
const CAMERA_WARMUP_MS = 550

/**
 * @typedef {Object} AutoRelocalizeStatus
 * @property {boolean} armed        Opted in and watching for an opportunity.
 * @property {boolean} scanning     An attempt is running right now.
 * @property {number} scansUsed     Uploads spent this session.
 * @property {string | null} lastReason Why the last evaluation did not scan.
 * @property {string | null} recentred  Landmark we last silently snapped to.
 */

/**
 * @typedef {Object} Suggestion
 * @property {string} label
 * @property {number} confidence
 * @property {import('../localization/tracker.js').Anchor} anchor
 */

/**
 * @param {Object} params
 * @param {boolean} params.enabled  User has opted in.
 * @param {import('../localization/tracker.js').TrackerState | null} params.position
 *   Live tracker state. Read through a ref, so its 15 Hz churn never restarts
 *   the scan loop.
 * @param {() => {cadenceHz: number}} params.getMotion Current gait, ref-backed.
 * @param {(anchor: import('../localization/tracker.js').Anchor) => void} params.onAnchor
 * @returns {{
 *   videoRef: {current: HTMLVideoElement | null},
 *   status: AutoRelocalizeStatus,
 *   suggestion: Suggestion | null,
 *   acceptSuggestion: () => void,
 *   dismissSuggestion: () => void,
 *   requestPermission: () => Promise<boolean>,
 * }}
 */
export function useAutoRelocalize({ enabled, position, getMotion, onAnchor }) {
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null))
  const tiltRef = useRef(/** @type {ReturnType<typeof createTiltSensor> | null} */ (null))

  /** Latest inputs, so the poll loop never needs to be torn down and rebuilt. */
  const latest = useRef({ position, getMotion, onAnchor, enabled })
  latest.current = { position, getMotion, onAnchor, enabled }

  const cameraReadyRef = useRef(false)
  const inFlightRef = useRef(false)
  const lastAttemptAtRef = useRef(-Infinity)
  const scansUsedRef = useRef(0)

  const [status, setStatus] = useState(
    /** @type {AutoRelocalizeStatus} */
    ({ armed: false, scanning: false, scansUsed: 0, lastReason: null, recentred: null })
  )
  const [suggestion, setSuggestion] = useState(/** @type {Suggestion | null} */ (null))

  /**
   * Ask for camera permission from a user gesture, then release it again.
   *
   * Called when the toggle is switched on, so the browser prompt appears while
   * the user is looking at a control they just touched — never unannounced
   * halfway down a corridor.
   *
   * @returns {Promise<boolean>} whether the camera is usable.
   */
  const requestPermission = useCallback(async () => {
    const video = videoRef.current
    if (!video) return false

    const { stream, state } = await openRearCamera(video)
    closeCamera(stream)
    video.srcObject = null

    cameraReadyRef.current = state === 'live'
    return cameraReadyRef.current
  }, [])

  /**
   * One attempt: open, grab, triage locally, upload at most one frame, close.
   * @returns {Promise<void>}
   */
  const runAttempt = useCallback(async () => {
    const video = videoRef.current
    if (!video || inFlightRef.current) return

    inFlightRef.current = true
    lastAttemptAtRef.current = performance.now()
    setStatus((s) => ({ ...s, scanning: true }))

    /** @type {MediaStream | null} */
    let stream = null
    try {
      const opened = await openRearCamera(video)
      stream = opened.stream
      if (opened.state !== 'live') {
        // Permission was revoked under us, or another tab took the camera.
        cameraReadyRef.current = false
        return
      }

      await sleep(CAMERA_WARMUP_MS)

      /** @type {string | null} */
      let payload = null
      /** @type {string | null} */
      let rejectedFor = null

      for (let i = 0; i < FRAMES_PER_ATTEMPT && !payload; i++) {
        if (i > 0) await sleep(FRAME_SPACING_MS)

        // Free local triage first — most frames die here and cost nothing.
        const thumb = captureImageData(video)
        if (!thumb) continue
        const score = scoreFrame(thumb)
        if (!score.usable) {
          rejectedFor = score.reason
          continue
        }
        payload = captureFrame(video)
      }

      if (!payload) {
        setStatus((s) => ({ ...s, lastReason: rejectedFor ?? 'no-frame' }))
        return
      }

      // Only now does this cost money.
      scansUsedRef.current += 1
      const result = await localizeFromImage(payload)

      const current = latest.current.position
      if (!current) return

      const action = classifyResult(result, {
        x: current.x,
        y: current.y,
        floor: current.floor,
        uncertaintyMetres: current.uncertaintyMetres,
      })

      if (action.action === 'anchor') {
        latest.current.onAnchor(action.anchor)
        setStatus((s) => ({ ...s, lastReason: null, recentred: action.anchor.label }))
      } else if (action.action === 'suggest') {
        setSuggestion({ label: action.label, confidence: action.confidence, anchor: action.anchor })
        setStatus((s) => ({ ...s, lastReason: null }))
      } else {
        setStatus((s) => ({ ...s, lastReason: action.reason }))
      }
    } finally {
      closeCamera(stream)
      if (videoRef.current) videoRef.current.srcObject = null
      inFlightRef.current = false
      setStatus((s) => ({ ...s, scanning: false, scansUsed: scansUsedRef.current }))
    }
  }, [])

  // The scan loop. Depends only on `enabled`, so the 15 Hz position stream
  // cannot cause it to be repeatedly torn down and rebuilt.
  useEffect(() => {
    if (!enabled) {
      tiltRef.current?.stop()
      tiltRef.current = null
      setStatus((s) => ({ ...s, armed: false, lastReason: null }))
      return
    }

    const tilt = createTiltSensor()
    tilt.start()
    tiltRef.current = tilt
    setStatus((s) => ({ ...s, armed: true }))

    const timer = setInterval(() => {
      // Never run the camera while the app is backgrounded.
      if (document.visibilityState !== 'visible') return

      const { position: pos, getMotion: motion } = latest.current
      const gate = shouldAttemptScan({
        enabled: true,
        needsReAnchor: pos?.needsReAnchor === true,
        cameraReady: cameraReadyRef.current,
        facingForward: tilt.facingForward(),
        online: navigator.onLine !== false,
        cadenceHz: motion().cadenceHz,
        msSinceLastScan: performance.now() - lastAttemptAtRef.current,
        scansUsed: scansUsedRef.current,
        inFlight: inFlightRef.current,
      })

      if (gate.attempt) void runAttempt()
      else setStatus((s) => (s.lastReason === gate.reason ? s : { ...s, lastReason: gate.reason }))
    }, GATE_POLL_MS)

    return () => {
      clearInterval(timer)
      tilt.stop()
      tiltRef.current = null
    }
  }, [enabled, runAttempt])

  // Release the camera if the component goes away mid-attempt.
  useEffect(
    () => () => {
      const video = videoRef.current
      if (video?.srcObject) {
        closeCamera(/** @type {MediaStream} */ (video.srcObject))
        video.srcObject = null
      }
      tiltRef.current?.stop()
    },
    []
  )

  // The pending suggestion is mirrored into a ref so accepting it can call
  // onAnchor directly. Doing that inside a setState updater would fire the
  // anchor twice under StrictMode's double-invoked reducers.
  const suggestionRef = useRef(/** @type {Suggestion | null} */ (null))
  suggestionRef.current = suggestion

  const acceptSuggestion = useCallback(() => {
    const pending = suggestionRef.current
    if (!pending) return
    suggestionRef.current = null
    setSuggestion(null)
    latest.current.onAnchor(pending.anchor)
  }, [])

  const dismissSuggestion = useCallback(() => setSuggestion(null), [])

  return { videoRef, status, suggestion, acceptSuggestion, dismissSuggestion, requestPermission }
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
