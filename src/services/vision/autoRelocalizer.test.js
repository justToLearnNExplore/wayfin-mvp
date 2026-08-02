/**
 * @file Tests for the automatic re-localization policy.
 * Run: node --test src/services/vision/autoRelocalizer.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldAttemptScan,
  isPlausibleJump,
  classifyResult,
  MIN_SCAN_INTERVAL_MS,
  MAX_SCANS_PER_SESSION,
  AUTO_ANCHOR_CONFIDENCE,
} from './autoRelocalizer.js'

/** Every gate open — tests then close exactly one at a time. */
const READY = {
  enabled: true,
  needsReAnchor: true,
  cameraReady: true,
  facingForward: true,
  online: true,
  cadenceHz: 0.8,
  msSinceLastScan: Infinity,
  scansUsed: 0,
  inFlight: false,
}

test('scans when every gate is open', () => {
  assert.deepEqual(shouldAttemptScan(READY), { attempt: true, reason: 'ok' })
})

test('never scans without opt-in, even when badly drifted', () => {
  const result = shouldAttemptScan({ ...READY, enabled: false })
  assert.equal(result.attempt, false)
  assert.equal(result.reason, 'disabled')
})

test('never scans while the fix is still trustworthy', () => {
  const result = shouldAttemptScan({ ...READY, needsReAnchor: false })
  assert.equal(result.attempt, false)
  assert.equal(result.reason, 'position-still-good')
})

test('respects the per-session budget', () => {
  const spent = shouldAttemptScan({ ...READY, scansUsed: MAX_SCANS_PER_SESSION })
  assert.equal(spent.attempt, false)
  assert.equal(spent.reason, 'budget-spent')

  const last = shouldAttemptScan({ ...READY, scansUsed: MAX_SCANS_PER_SESSION - 1 })
  assert.equal(last.attempt, true, 'the final scan in the budget must be allowed')
})

test('respects the minimum interval', () => {
  const tooSoon = shouldAttemptScan({ ...READY, msSinceLastScan: MIN_SCAN_INTERVAL_MS - 1 })
  assert.equal(tooSoon.reason, 'too-soon')

  const ready = shouldAttemptScan({ ...READY, msSinceLastScan: MIN_SCAN_INTERVAL_MS })
  assert.equal(ready.attempt, true)
})

test('will not photograph a pocket or a brisk walk', () => {
  assert.equal(shouldAttemptScan({ ...READY, facingForward: false }).reason, 'not-facing-forward')
  assert.equal(shouldAttemptScan({ ...READY, cadenceHz: 2.4 }).reason, 'moving-too-fast')
})

test('will not fire offline, unpermitted, or on top of itself', () => {
  assert.equal(shouldAttemptScan({ ...READY, online: false }).reason, 'offline')
  assert.equal(shouldAttemptScan({ ...READY, cameraReady: false }).reason, 'no-permission')
  assert.equal(shouldAttemptScan({ ...READY, inFlight: true }).reason, 'in-flight')
})

// ---- plausibility ---------------------------------------------------------

test('the plausible radius widens with our own uncertainty', () => {
  const here = { x: 50, y: 50 }
  const far = { x: 90, y: 50 }

  // A confident dot may not be dragged that far...
  assert.equal(isPlausibleJump(here, far, 4), false)
  // ...but a badly drifted one is exactly the case where a big jump is right.
  assert.equal(isPlausibleJump(here, far, 30), true)
})

test('a never-anchored dot with infinite uncertainty still has a finite budget', () => {
  const near = isPlausibleJump({ x: 50, y: 50 }, { x: 52, y: 50 }, Infinity)
  const wild = isPlausibleJump({ x: 50, y: 50 }, { x: 5, y: 95 }, Infinity)
  assert.equal(near, true)
  assert.equal(wild, false, 'Infinity must not disable the check')
})

// ---- result classification ------------------------------------------------

const CONTEXT = { x: 50, y: 50, floor: 'G', uncertaintyMetres: 14 }

/** @param {object} over */
const vision = (over) => ({
  status: 'placed',
  landmark: 'H&M',
  confidence: 0.95,
  matches: [{ nodeId: 'G:H&M', name: 'H&M', floor: 'G', floorLabel: 'Ground', x: 54, y: 50 }],
  visibleText: [],
  ...over,
})

test('a confident, nearby, same-floor match anchors silently', () => {
  const action = classifyResult(/** @type {any} */ (vision({})), CONTEXT)
  assert.equal(action.action, 'anchor')
  assert.equal(action.anchor.nodeId, 'G:H&M')
  assert.equal(action.anchor.source, 'vision')
})

test('a merely likely match is suggested, never applied silently', () => {
  const action = classifyResult(
    /** @type {any} */ (vision({ status: 'confirm', confidence: AUTO_ANCHOR_CONFIDENCE - 0.05 })),
    CONTEXT
  )
  assert.equal(action.action, 'suggest')
  assert.equal(action.label, 'H&M')
})

test('a weak match is dropped entirely', () => {
  const action = classifyResult(/** @type {any} */ (vision({ confidence: 0.3 })), CONTEXT)
  assert.equal(action.action, 'ignore')
  assert.equal(action.reason, 'low-confidence')
})

test('a different floor is treated as misrecognition, not a floor change', () => {
  const action = classifyResult(
    /** @type {any} */ (vision({ matches: [{ nodeId: 'F2:H&M', name: 'H&M', floor: 'F2', floorLabel: 'First', x: 54, y: 50 }] })),
    CONTEXT
  )
  assert.equal(action.action, 'ignore')
  assert.equal(action.reason, 'wrong-floor')
})

test('the wrong branch of a chain is rejected as an implausible jump', () => {
  // Same brand, same floor, high confidence — and 45 m away, which our 14 m
  // halo cannot justify. This is the failure the gate exists for.
  const action = classifyResult(
    /** @type {any} */ (vision({ matches: [{ nodeId: 'G:H&M-2', name: 'H&M', floor: 'G', floorLabel: 'Ground', x: 95, y: 50 }] })),
    CONTEXT
  )
  assert.equal(action.action, 'ignore')
  assert.equal(action.reason, 'implausible-jump')
})

test('an unresolvable floor is declined rather than guessed', () => {
  const action = classifyResult(/** @type {any} */ (vision({ status: 'choose-floor' })), CONTEXT)
  assert.equal(action.action, 'ignore')
  assert.equal(action.reason, 'ambiguous-floor')
})

test('service failures never fabricate a position', () => {
  for (const status of ['no-match', 'unavailable', 'error']) {
    const action = classifyResult(/** @type {any} */ ({ status }), CONTEXT)
    assert.equal(action.action, 'ignore')
    assert.equal(action.reason, status)
  }
})
