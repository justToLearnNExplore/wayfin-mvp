/**
 * @file The guidance session — one journey, many views.
 *
 * Owns everything that changes *while walking*: which step is active, how far
 * is left, and what should be said aloud. Both the map and the chat read from
 * this single source, so the visual dot and the spoken instruction can never
 * disagree.
 *
 * It consumes the deterministic route produced by `describeRoute()` and never
 * recomputes a path — if the user strays, the answer is to re-anchor or
 * re-route, never to invent a new line.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { distanceMetres } from '../localization/geometry.js'
import { createVoiceServices } from '../voice/index.js'

/** Within this many metres of a step's target, the step is considered done. */
const ARRIVAL_RADIUS_M = 7

/** Within this distance of the destination, we announce arrival. */
const DESTINATION_RADIUS_M = 6

/** Average indoor walking speed, metres per minute (~4.5 km/h). */
const WALK_SPEED_M_PER_MIN = 75

/**
 * @typedef {Object} GuidanceStep
 * @property {string} text
 * @property {string} kind    'start' | 'walk' | 'escalator' | 'lift' | 'arrival'
 * @property {string} floor
 * @property {string} [toFloor]
 * @property {string} from
 * @property {string} to
 * @property {number} step
 */

/**
 * @typedef {Object} NavigationSession
 * @property {number} stepIndex
 * @property {GuidanceStep | undefined} step
 * @property {number} remainingMetres
 * @property {number} etaMinutes
 * @property {boolean} arrived
 * @property {string} activeFloor        Floor the guidance is currently on.
 * @property {boolean} muted
 * @property {() => void} toggleMute
 * @property {() => void} next
 * @property {(index: number) => void} goToStep
 * @property {() => void} repeat         Re-speak the current instruction.
 */

/**
 * @param {Object} params
 * @param {any} params.route              Result of describeRoute().
 * @param {{x:number,y:number,floor:string} | null} params.position Live fix.
 * @param {boolean} params.isLocalized
 * @param {boolean} [params.voiceEnabled]
 * @returns {NavigationSession}
 */
export function useNavigationSession({ route, position, isLocalized, voiceEnabled = true }) {
  const guidance = useMemo(() => /** @type {GuidanceStep[]} */ (route?.guidance ?? []), [route])
  const [stepIndex, setStepIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [arrived, setArrived] = useState(false)

  const voiceRef = useRef(/** @type {ReturnType<typeof createVoiceServices> | null} */ (null))
  const spokenForStep = useRef(-1)

  /** Node lookup for the current route, by graph id. */
  const nodesById = useMemo(() => {
    /** @type {Map<string, {x:number,y:number,floor:string,name:string}>} */
    const map = new Map()
    for (const node of route?.path ?? []) map.set(node.id, node)
    return map
  }, [route])

  const step = guidance[Math.min(stepIndex, guidance.length - 1)]
  const isLast = stepIndex >= guidance.length - 1

  /** Floor the guidance is on — after a level change, the landing floor. */
  const activeFloor =
    step?.kind === 'escalator' || step?.kind === 'lift' ? step.toFloor ?? step.floor : step?.floor ?? route?.dest?.floor

  // ---- spoken guidance --------------------------------------------------
  const speak = useCallback(
    (/** @type {string} */ text) => {
      if (!voiceEnabled || muted || !text) return
      if (!voiceRef.current) voiceRef.current = createVoiceServices()
      voiceRef.current.speaker.speak(text, { lang: 'en-IN' })
    },
    [voiceEnabled, muted]
  )

  // Announce each instruction exactly once, however the step was reached
  // (auto-advance, manual NEXT, or a floor-rail jump).
  useEffect(() => {
    if (!step || spokenForStep.current === stepIndex) return
    spokenForStep.current = stepIndex
    speak(step.text)
  }, [step, stepIndex, speak])

  // ---- automatic step advance ------------------------------------------
  // A step completes when the walker reaches its target node. Manual NEXT
  // stays available because dead reckoning can stall (phone in a pocket,
  // sensors denied) and the user must never be stuck.
  useEffect(() => {
    if (!isLocalized || !position || !step || isLast) return
    const target = nodesById.get(step.to)
    if (!target || target.floor !== position.floor) return

    if (distanceMetres(position, target) <= ARRIVAL_RADIUS_M) {
      setStepIndex((i) => Math.min(i + 1, guidance.length - 1))
    }
    // Depend on the coordinate primitives rather than the position object:
    // callers pass a fresh literal each render, which would otherwise re-run
    // this check on every frame instead of only when the walker actually moves.
  }, [position?.x, position?.y, position?.floor, step, isLast, isLocalized, nodesById, guidance.length])

  // ---- arrival ----------------------------------------------------------
  useEffect(() => {
    if (!isLocalized || !position || arrived || !route?.dest) return
    if (position.floor !== route.dest.floor) return
    if (distanceMetres(position, route.dest) <= DESTINATION_RADIUS_M) {
      setArrived(true)
      speak(`You have arrived at ${route.dest.name}.`)
    }
  }, [position?.x, position?.y, position?.floor, isLocalized, arrived, route, speak])

  // ---- live distance + ETA ---------------------------------------------
  // Measured from the live fix along the remaining route vertices, so both
  // numbers fall as the user walks rather than staying frozen at the
  // originally-computed total.
  const remainingMetres = useMemo(() => {
    if (!route?.path?.length) return 0
    if (!isLocalized || !position) return route.metres ?? 0

    // Find the closest vertex ahead of us, then sum the rest of the polyline.
    const path = route.path
    let nearestIndex = 0
    let nearestDist = Infinity
    for (let i = 0; i < path.length; i++) {
      if (path[i].floor !== position.floor) continue
      const d = distanceMetres(position, path[i])
      if (d < nearestDist) {
        nearestDist = d
        nearestIndex = i
      }
    }

    let total = nearestDist
    for (let i = nearestIndex; i < path.length - 1; i++) {
      // Level changes contribute vertical travel time, not floor distance.
      if (path[i].floor !== path[i + 1].floor) {
        total += 12
        continue
      }
      total += distanceMetres(path[i], path[i + 1])
    }
    return Math.max(0, Math.round(total))
  }, [route, position, isLocalized])

  const etaMinutes = Math.max(1, Math.round(remainingMetres / WALK_SPEED_M_PER_MIN))

  const next = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, Math.max(0, guidance.length - 1)))
  }, [guidance.length])

  const goToStep = useCallback(
    (/** @type {number} */ index) => {
      setStepIndex(Math.max(0, Math.min(index, guidance.length - 1)))
    },
    [guidance.length]
  )

  const repeat = useCallback(() => {
    if (step) {
      // Bypass the once-per-step guard for an explicit request.
      spokenForStep.current = -1
      speak(step.text)
    }
  }, [step, speak])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) voiceRef.current?.speaker.cancel()
      return !m
    })
  }, [])

  // Stop any in-flight speech when the screen closes.
  useEffect(() => () => voiceRef.current?.speaker.cancel(), [])

  return {
    stepIndex,
    step,
    remainingMetres,
    etaMinutes,
    arrived,
    activeFloor: activeFloor ?? 'G',
    muted,
    toggleMute,
    next,
    goToStep,
    repeat,
  }
}
