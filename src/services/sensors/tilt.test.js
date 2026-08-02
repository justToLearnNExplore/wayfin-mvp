/**
 * @file Tests for the camera-orientation gate.
 * Run: node --test src/services/sensors/tilt.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraFacingForward } from './tilt.js'

test('a phone held upright is facing forward', () => {
  assert.equal(cameraFacingForward(90, 0), true)
  assert.equal(cameraFacingForward(70, -12), true)
})

test('a phone lying flat is not', () => {
  assert.equal(cameraFacingForward(0, 0), false, 'screen up, camera at the floor')
  assert.equal(cameraFacingForward(178, 0), false, 'screen down, camera at the ceiling')
})

test('a heavily rolled phone is rejected', () => {
  assert.equal(cameraFacingForward(90, 80), false)
  assert.equal(cameraFacingForward(90, -80), false)
})

test('a missing roll reading does not block a good tilt', () => {
  // Some Androids omit gamma; we should not lose the feature over it.
  assert.equal(cameraFacingForward(90, null), true)
  assert.equal(cameraFacingForward(90, undefined), true)
})

test('a missing tilt reading fails closed', () => {
  // Better to skip a scan than spend an API call on an unknown orientation.
  assert.equal(cameraFacingForward(null, 0), false)
  assert.equal(cameraFacingForward(undefined, undefined), false)
  assert.equal(cameraFacingForward(NaN, 0), false)
})
