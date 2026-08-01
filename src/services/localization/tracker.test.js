/**
 * @file Unit tests for the localization math.
 * Run with:  node --test src/services/localization/tracker.test.js
 *
 * These cover the pieces that cannot be checked by walking around with a
 * phone: step detection against a synthetic gait signal, metre-space bearing
 * math, map matching, and drift accumulation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  advance,
  angleDelta,
  bearingBetween,
  distanceMetres,
  normalizeDeg,
  smoothHeading,
} from './geometry.js'
import { LocalizationTracker, projectOntoPath } from './tracker.js'
import { StepDetector, strideFromCadence } from '../sensors/pedometer.js'

/**
 * Synthesise an accelerometer magnitude stream for a walking human.
 * @param {number} seconds
 * @param {number} stepsPerSecond
 * @param {number} [sampleHz]
 * @param {number} [amplitude]
 */
function* gaitSignal(seconds, stepsPerSecond, sampleHz = 60, amplitude = 1.8) {
  const samples = Math.floor(seconds * sampleHz)
  for (let i = 0; i < samples; i++) {
    const t = i / sampleHz
    // Gravity + gait oscillation + a little sensor noise.
    const noise = Math.sin(t * 57.3) * 0.06
    yield {
      magnitude: 9.81 + amplitude * Math.sin(2 * Math.PI * stepsPerSecond * t) + noise,
      t: t * 1000,
    }
  }
}

test('geometry: bearings are computed in metre space, not unit space', () => {
  const origin = { x: 50, y: 50 }
  // +x is the mall's long axis → due "right" on the map = 90°.
  assert.equal(Math.round(bearingBetween(origin, { x: 60, y: 50 })), 90)
  // -y is map "up" = 0°.
  assert.equal(Math.round(bearingBetween(origin, { x: 50, y: 40 })), 0)
  assert.equal(Math.round(bearingBetween(origin, { x: 50, y: 60 })), 180)
  assert.equal(Math.round(bearingBetween(origin, { x: 40, y: 50 })), 270)

  // The axes have different scales, so a 45° bearing is NOT at equal unit
  // deltas. 10 x-units = 20 m; to match we need 20 m of y = 50 y-units.
  assert.equal(Math.round(bearingBetween(origin, { x: 60, y: 0 })), 45)
})

test('geometry: advance moves the right real-world distance', () => {
  const start = { x: 50, y: 50 }
  const moved = advance(start, 90, 10) // 10 m due map-right
  assert.ok(Math.abs(distanceMetres(start, moved) - 10) < 1e-9)
  assert.ok(Math.abs(moved.x - 55) < 1e-9) // 10 m / 2 m-per-unit = 5 units
  assert.ok(Math.abs(moved.y - 50) < 1e-9)

  const up = advance(start, 0, 10) // 10 m due map-up
  assert.ok(Math.abs(distanceMetres(start, up) - 10) < 1e-9)
  assert.ok(Math.abs(up.y - 25) < 1e-9) // 10 m / 0.4 m-per-unit = 25 units
})

test('geometry: heading smoothing crosses the 0/360 wrap correctly', () => {
  assert.equal(angleDelta(350, 10), 20)
  assert.equal(angleDelta(10, 350), -20)
  // Smoothing from 350° toward 10° must go up through 360, not down to 180.
  const smoothed = smoothHeading(350, 10, 0.5)
  assert.equal(normalizeDeg(smoothed), 0)
})

test('pedometer: detects a plausible step count from a synthetic gait', () => {
  const detector = new StepDetector()
  const seconds = 10
  const cadence = 1.8
  let steps = 0

  for (const { magnitude, t } of gaitSignal(seconds, cadence)) {
    if (detector.push(magnitude, t)) steps += 1
  }

  const expected = seconds * cadence // 18
  // Allow the filter warm-up to cost a step or two either way.
  assert.ok(
    Math.abs(steps - expected) <= 2,
    `expected ~${expected} steps, detected ${steps}`
  )
})

test('pedometer: ignores stationary noise', () => {
  const detector = new StepDetector()
  let steps = 0
  for (let i = 0; i < 600; i++) {
    // Phone sitting on a table: gravity plus tiny jitter.
    const magnitude = 9.81 + Math.sin(i * 0.7) * 0.15
    if (detector.push(magnitude, i * (1000 / 60))) steps += 1
  }
  assert.equal(steps, 0)
})

test('pedometer: refractory period caps implausible cadence', () => {
  const detector = new StepDetector()
  let steps = 0
  // 8 steps/sec is not human — the refractory period should reject half.
  for (const { magnitude, t } of gaitSignal(5, 8)) {
    if (detector.push(magnitude, t)) steps += 1
  }
  assert.ok(steps < 5 * 8, `expected fewer than 40 steps, got ${steps}`)
})

test('stride adapts to cadence within human bounds', () => {
  assert.ok(strideFromCadence(0) === 0.7)
  assert.ok(strideFromCadence(1.8) > 0.65 && strideFromCadence(1.8) < 0.75)
  assert.ok(strideFromCadence(3.5) <= 0.95)
  assert.ok(strideFromCadence(0.5) >= 0.45)
})

test('map matching projects onto the nearest route segment', () => {
  const path = [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ]
  // A point drifting off the corridor should snap back onto it.
  const snapped = projectOntoPath({ x: 40, y: 62 }, path)
  assert.equal(Math.round(snapped.x), 40)
  assert.equal(Math.round(snapped.y), 50)

  // Beyond the end of the line it clamps to the endpoint, never extrapolates.
  const past = projectOntoPath({ x: 140, y: 50 }, path)
  assert.equal(Math.round(past.x), 100)
})

test('map matching survives degenerate (zero-length) segments', () => {
  const path = [
    { x: 10, y: 10 },
    { x: 10, y: 10 },
    { x: 20, y: 10 },
  ]
  const snapped = projectOntoPath({ x: 15, y: 14 }, path)
  assert.ok(Number.isFinite(snapped.x) && Number.isFinite(snapped.y))
})

test('tracker: dead reckoning walks the expected distance', () => {
  const tracker = new LocalizationTracker({ adaptiveStride: false, stepMetres: 0.7 })
  tracker.anchor({ x: 10, y: 50, floor: 'G', source: 'manual', label: 'H&M' })
  tracker.setHeading(90) // due map-right

  for (let i = 0; i < 100; i++) tracker.step()

  const state = tracker.getState()
  assert.equal(state.steps, 100)
  assert.ok(Math.abs(state.metresTravelled - 70) < 1e-6)
  // Display lags the estimate by design; drain the smoothing first.
  for (let i = 0; i < 400; i++) tracker.tickDisplay()
  const settled = tracker.getState()
  // 70 m along +x = 35 map units.
  assert.ok(Math.abs(settled.x - 45) < 0.5, `x drifted to ${settled.x}`)
  assert.ok(Math.abs(settled.y - 50) < 0.5)
})

test('tracker: uncertainty grows while walking and resets on re-anchor', () => {
  const tracker = new LocalizationTracker({ adaptiveStride: false })
  tracker.anchor({ x: 10, y: 50, floor: 'G', source: 'vision', confidence: 1 })
  const initial = tracker.uncertaintyMetres()

  tracker.setHeading(90)
  for (let i = 0; i < 200; i++) tracker.step() // 140 m
  const drifted = tracker.uncertaintyMetres()

  assert.ok(drifted > initial, 'uncertainty should grow with distance')
  assert.ok(tracker.getState().needsReAnchor, 'should ask for a re-scan by now')

  tracker.anchor({ x: 60, y: 50, floor: 'G', source: 'qr' })
  const reAnchored = tracker.getState()
  assert.ok(reAnchored.uncertaintyMetres < initial, 'QR re-anchor should tighten the fix')
  assert.equal(reAnchored.needsReAnchor, false)
  assert.equal(reAnchored.steps, 0, 'error budget resets')
})

test('tracker: ignores steps before the first anchor', () => {
  const tracker = new LocalizationTracker()
  tracker.setHeading(90)
  tracker.step()
  const state = tracker.getState()
  assert.equal(state.isLocalized, false)
  assert.equal(state.steps, 0)
  assert.equal(state.confidence, 0)
})

test('tracker: route snapping keeps the dot in the corridor', () => {
  const tracker = new LocalizationTracker({ adaptiveStride: false })
  tracker.anchor({ x: 10, y: 50, floor: 'G', source: 'manual' })
  tracker.setRoutePath([
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ])
  // Deliberately walk at a wrong heading — map matching should absorb it.
  tracker.setHeading(135)
  for (let i = 0; i < 60; i++) tracker.step()

  const state = tracker.getState()
  assert.ok(Math.abs(state.y - 50) < 0.001, `y should stay on the corridor, got ${state.y}`)
})
