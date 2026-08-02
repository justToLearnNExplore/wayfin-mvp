/**
 * @file Tests for automatic map-north calibration.
 * Run: node --test src/services/localization/autoCalibration.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NorthCalibrator,
  circularMean,
  mapBearingBetween,
  MIN_USABLE_CONFIDENCE,
} from './autoCalibration.js'

test('circular mean handles the 0/360 seam', () => {
  // A plain average of 350 and 10 gives 180 — the exact opposite direction.
  const { mean } = circularMean([350, 10])
  assert.ok(mean < 1 || mean > 359, `expected ~0, got ${mean}`)
})

test('circular spread separates a straight walk from a turn', () => {
  assert.ok(circularMean([90, 92, 88, 91]).spread < 5)
  assert.ok(circularMean([0, 90, 180, 270]).spread > 100)
})

test('map bearing is clockwise from map-up', () => {
  const origin = { x: 50, y: 50, floor: 'G' }
  // -y is "up" on the map.
  assert.equal(Math.round(mapBearingBetween(origin, { x: 50, y: 40, floor: 'G' })), 0)
  assert.equal(Math.round(mapBearingBetween(origin, { x: 60, y: 50, floor: 'G' })), 90)
  assert.equal(Math.round(mapBearingBetween(origin, { x: 50, y: 60, floor: 'G' })), 180)
})

test('recovers a known north offset from one straight leg', () => {
  const calibrator = new NorthCalibrator()
  const TRUE_OFFSET = 285

  const from = { x: 20, y: 50, floor: 'G' }
  const to = { x: 60, y: 50, floor: 'G' } // due map-east, bearing 90

  calibrator.onAnchor(from)
  // Walking bearing 90 in map frame reads (90 + offset) on the compass.
  const compassReading = (90 + TRUE_OFFSET) % 360
  for (let i = 0; i < 20; i++) calibrator.addCompassSample(compassReading + (i % 3) - 1)
  const result = calibrator.onAnchor(to, { metresTravelled: 80 })

  assert.equal(result.learned, true)
  assert.ok(result.offset != null, 'a learned result must carry an offset')
  assert.ok(Math.abs(result.offset - TRUE_OFFSET) < 3, `got ${result.offset}`)
})

test('refuses to learn from a leg that is too short', () => {
  const calibrator = new NorthCalibrator()
  calibrator.onAnchor({ x: 50, y: 50, floor: 'G' })
  for (let i = 0; i < 20; i++) calibrator.addCompassSample(100)
  const result = calibrator.onAnchor({ x: 51, y: 50, floor: 'G' }, { metresTravelled: 2 })
  assert.equal(result.learned, false)
  assert.equal(result.reason, 'leg-too-short')
})

test('refuses to learn when the walk was not straight', () => {
  const calibrator = new NorthCalibrator()
  calibrator.onAnchor({ x: 20, y: 50, floor: 'G' })
  // Walked around a corner: compass swings through 180 degrees.
  for (let i = 0; i < 20; i++) calibrator.addCompassSample(i * 9)
  const result = calibrator.onAnchor({ x: 60, y: 50, floor: 'G' }, { metresTravelled: 80 })
  assert.equal(result.learned, false)
  assert.equal(result.reason, 'path-not-straight')
})

test('refuses to learn when the user corrected a fix instead of walking', () => {
  const calibrator = new NorthCalibrator()
  calibrator.onAnchor({ x: 20, y: 50, floor: 'G' })
  for (let i = 0; i < 20; i++) calibrator.addCompassSample(100)
  // Anchors 80 m apart but the pedometer only saw 3 m — a teleport, not a walk.
  const result = calibrator.onAnchor({ x: 60, y: 50, floor: 'G' }, { metresTravelled: 3 })
  assert.equal(result.learned, false)
  assert.equal(result.reason, 'not-actually-walked')
})

test('a floor change never contributes an observation', () => {
  const calibrator = new NorthCalibrator()
  calibrator.onAnchor({ x: 20, y: 50, floor: 'G' })
  for (let i = 0; i < 20; i++) calibrator.addCompassSample(100)
  const result = calibrator.onAnchor({ x: 60, y: 50, floor: 'F2' }, { metresTravelled: 80 })
  assert.equal(result.learned, false)
  assert.equal(result.reason, 'floor-change')
})

test('confidence starts unusable and rises with agreeing observations', () => {
  const calibrator = new NorthCalibrator()
  assert.equal(calibrator.getEstimate().confidence, 0)

  const walk = (/** @type {Point} */ a, /** @type {Point} */ b, /** @type {number} */ offset) => {
    calibrator.onAnchor(a)
    const bearing = mapBearingBetween(a, b)
    for (let i = 0; i < 20; i++) calibrator.addCompassSample((bearing + offset) % 360)
    calibrator.onAnchor(b, { metresTravelled: 999 })
  }

  walk({ x: 20, y: 50, floor: 'G' }, { x: 60, y: 50, floor: 'G' }, 285)
  const afterOne = calibrator.getEstimate()
  assert.equal(afterOne.samples, 1)
  assert.ok(afterOne.confidence < MIN_USABLE_CONFIDENCE, 'one leg must not be trusted yet')

  // Two more agreeing legs, including a different direction.
  walk({ x: 60, y: 50, floor: 'G' }, { x: 60, y: 20, floor: 'G' }, 285)
  walk({ x: 60, y: 20, floor: 'G' }, { x: 20, y: 20, floor: 'G' }, 285)

  const settled = calibrator.getEstimate()
  assert.ok(settled.confidence >= MIN_USABLE_CONFIDENCE, `confidence ${settled.confidence}`)
  assert.ok(Math.abs(settled.offset - 285) < 3, `offset ${settled.offset}`)
})

/** @typedef {{x:number,y:number,floor:string}} Point */
