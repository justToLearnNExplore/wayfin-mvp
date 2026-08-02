/**
 * @file Policy for automatic, unprompted camera re-localization.
 *
 * Two pure decisions live here, deliberately separated from the React hook and
 * from the camera so both can be tested without a browser:
 *
 *   1. {@link shouldAttemptScan}  — is it worth opening the camera right now?
 *   2. {@link classifyResult}     — do we trust what vision sent back enough
 *                                   to move the dot without asking?
 *
 * DESIGN NOTE — a silent correction needs a higher bar than a manual one.
 * When the user taps "Point Camera" they are watching, and a wrong answer is
 * visibly wrong and instantly retried. An automatic fix happens while they are
 * walking and reading the next instruction, so a wrong one silently teleports
 * them and quietly ruins the route. That asymmetry is why the auto path
 * demands more confidence than the manual 0.85, insists the floor still
 * matches, and refuses jumps that are implausibly far given how uncertain we
 * currently are.
 *
 * The failure mode this guards against is concrete: chains have several
 * branches in one mall. Recognising a "STARBUCKS" sign tells you which brand
 * you are looking at, not which of its three counters. The plausibility gate
 * turns that from a teleport into a discarded frame.
 *
 * This module never computes a route and never touches the graph. It only
 * decides whether a position observation is worth believing.
 */

import { distanceMetres } from '../localization/geometry.js'

/** Minimum gap between two scan attempts. Hard floor on spend and battery. */
export const MIN_SCAN_INTERVAL_MS = 15_000

/**
 * Hard ceiling on automatic scans per navigation session.
 *
 * With the interval above, an unbounded loop could fire ~12 times over a
 * three-minute walk. Six is enough to rescue a genuinely drifting route and
 * caps the worst case a user can cost us without ever tapping anything.
 */
export const MAX_SCANS_PER_SESSION = 6

/** Above this cadence the walker is brisk enough that frames smear. */
export const MAX_CADENCE_HZ = 1.6

/** Confidence required to move the dot with no confirmation. */
export const AUTO_ANCHOR_CONFIDENCE = 0.9

/** Confidence below which a result is not even worth suggesting. */
export const MIN_SUGGEST_CONFIDENCE = 0.5

/**
 * Floor on the plausibility radius, in metres.
 *
 * Even a freshly anchored dot may legitimately be a shopfront or two out, so
 * the radius never collapses below this no matter how confident we are.
 */
export const MIN_PLAUSIBLE_JUMP_M = 25

/** How many uncertainty radii a correction may span before we disbelieve it. */
export const PLAUSIBLE_JUMP_SIGMAS = 3

/**
 * @typedef {Object} ScanGateInput
 * @property {boolean} enabled          User has opted in.
 * @property {boolean} needsReAnchor    Drift has outgrown the shopfront spacing.
 * @property {boolean} cameraReady      Permission already granted this session.
 * @property {boolean} facingForward    Rear camera is pointed at the world.
 * @property {boolean} online           navigator.onLine.
 * @property {number} cadenceHz         Current walking cadence, 0 when still.
 * @property {number} msSinceLastScan   Infinity before the first attempt.
 * @property {number} scansUsed         Attempts already spent this session.
 * @property {boolean} [inFlight]       A scan is already running.
 */

/**
 * @typedef {'ok' | 'disabled' | 'no-permission' | 'offline' | 'in-flight'
 *   | 'position-still-good' | 'budget-spent' | 'too-soon' | 'not-facing-forward'
 *   | 'moving-too-fast'} ScanGateReason
 */

/**
 * Decide whether to attempt a scan right now.
 *
 * Ordered cheapest-and-most-decisive first, and every rejection is named so
 * the UI can explain itself ("waiting until you slow down") instead of looking
 * broken.
 *
 * @param {ScanGateInput} input
 * @returns {{attempt: boolean, reason: ScanGateReason}}
 */
export function shouldAttemptScan(input) {
  if (!input.enabled) return { attempt: false, reason: 'disabled' }
  if (input.inFlight) return { attempt: false, reason: 'in-flight' }
  if (!input.cameraReady) return { attempt: false, reason: 'no-permission' }
  if (!input.online) return { attempt: false, reason: 'offline' }

  // The whole feature is a drift remedy. A dot that is still trustworthy does
  // not need correcting, and scanning it would be pure spend.
  if (!input.needsReAnchor) return { attempt: false, reason: 'position-still-good' }

  if (input.scansUsed >= MAX_SCANS_PER_SESSION) return { attempt: false, reason: 'budget-spent' }
  if (input.msSinceLastScan < MIN_SCAN_INTERVAL_MS) return { attempt: false, reason: 'too-soon' }
  if (!input.facingForward) return { attempt: false, reason: 'not-facing-forward' }
  if (input.cadenceHz > MAX_CADENCE_HZ) return { attempt: false, reason: 'moving-too-fast' }

  return { attempt: true, reason: 'ok' }
}

/**
 * Could the user really be there, given where we thought they were?
 *
 * The allowance scales with our own uncertainty: a confident dot may only be
 * nudged, while a badly drifted one is permitted a large correction — which is
 * the correct behaviour, because a drifted dot is exactly the case where a big
 * jump is genuinely warranted.
 *
 * @param {{x: number, y: number}} from Current estimate.
 * @param {{x: number, y: number}} to   Proposed landmark position.
 * @param {number} uncertaintyMetres    Current halo radius.
 * @returns {boolean}
 */
export function isPlausibleJump(from, to, uncertaintyMetres) {
  const budget = Math.max(
    MIN_PLAUSIBLE_JUMP_M,
    (Number.isFinite(uncertaintyMetres) ? uncertaintyMetres : 0) * PLAUSIBLE_JUMP_SIGMAS
  )
  return distanceMetres(from, to) <= budget
}

/**
 * @typedef {Object} ClassifyContext
 * @property {number} x                 Current estimate.
 * @property {number} y
 * @property {string} floor             Floor the tracker believes we are on.
 * @property {number} uncertaintyMetres
 */

/**
 * @typedef {Object} AnchorAction
 * @property {'anchor'} action
 * @property {{x: number, y: number, floor: string, source: 'vision', label: string,
 *   confidence: number, nodeId?: string}} anchor
 */

/**
 * @typedef {Object} SuggestAction
 * @property {'suggest'} action
 * @property {string} label
 * @property {number} confidence
 * @property {{x: number, y: number, floor: string, source: 'vision', label: string,
 *   confidence: number, nodeId?: string}} anchor Applied only if the user says yes.
 */

/**
 * @typedef {Object} IgnoreAction
 * @property {'ignore'} action
 * @property {'no-match' | 'unavailable' | 'error' | 'low-confidence' | 'ambiguous-floor'
 *   | 'wrong-floor' | 'implausible-jump'} reason
 */

/** @typedef {AnchorAction | SuggestAction | IgnoreAction} RelocalizeAction */

/**
 * Turn a vision result into an action, applying the higher automatic bar.
 *
 * @param {import('./localizer.js').VisionResult} result
 * @param {ClassifyContext} context
 * @returns {RelocalizeAction}
 */
export function classifyResult(result, context) {
  // Narrowed positively — naming the two statuses we can act on lets the type
  // checker prove the landmark fields below exist, and means a new result
  // status added later fails closed here rather than falling through.
  if (result.status !== 'placed' && result.status !== 'confirm') {
    // 'choose-floor' means a landmark spanning several floors (PVR, the
    // atriums), which a photo genuinely cannot resolve. The manual flow asks;
    // the automatic one has nobody to ask mid-walk, so it declines.
    return {
      action: 'ignore',
      reason: result.status === 'choose-floor' ? 'ambiguous-floor' : result.status,
    }
  }

  const match = result.matches?.[0]
  if (!match) return { action: 'ignore', reason: 'no-match' }

  // Vision claiming a different floor is far more likely a misrecognition than
  // a real floor change: escalators are on the route, and taking one updates
  // the floor through the routing session, not through a photo.
  if (match.floor !== context.floor) return { action: 'ignore', reason: 'wrong-floor' }

  if (!isPlausibleJump(context, match, context.uncertaintyMetres)) {
    return { action: 'ignore', reason: 'implausible-jump' }
  }

  /** @type {AnchorAction['anchor']} */
  const anchor = {
    x: match.x,
    y: match.y,
    floor: match.floor,
    source: 'vision',
    label: result.landmark,
    confidence: result.confidence,
    ...(match.nodeId ? { nodeId: match.nodeId } : {}),
  }

  if (result.confidence >= AUTO_ANCHOR_CONFIDENCE) return { action: 'anchor', anchor }
  if (result.confidence >= MIN_SUGGEST_CONFIDENCE) {
    return { action: 'suggest', label: result.landmark, confidence: result.confidence, anchor }
  }
  return { action: 'ignore', reason: 'low-confidence' }
}
