/**
 * @file Tests for the local frame-quality pre-filter.
 * Run: node --test src/services/vision/frameQuality.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreFrame, MIN_SHARPNESS, MIN_EDGE_DENSITY } from './frameQuality.js'

const SIZE = 64

/**
 * Build an ImageData-shaped buffer from a per-pixel luma function.
 * @param {(x: number, y: number) => number} luma
 * @param {number} [width]
 * @param {number} [height]
 */
function frame(luma, width = SIZE, height = SIZE) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const v = luma(x, y)
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

/** Horizontal box blur of radius `r` — what walking does to a frame. */
function blur(src, r) {
  return frame((x, y) => {
    let sum = 0
    let n = 0
    for (let k = -r; k <= r; k++) {
      const sx = Math.min(SIZE - 1, Math.max(0, x + k))
      sum += src.data[(y * SIZE + sx) * 4]
      n++
    }
    return sum / n
  })
}

/** Hard-edged bars — the signal a shopfront sign produces. */
const signage = frame((x) => (Math.floor(x / 8) % 2 === 0 ? 30 : 225))

test('high-contrast signage passes', () => {
  const score = scoreFrame(signage)
  assert.equal(score.usable, true, `reason ${score.reason}`)
  assert.ok(score.sharpness > MIN_SHARPNESS)
  assert.ok(score.edgeDensity > MIN_EDGE_DENSITY)
})

test('a blank wall is featureless, not blurry', () => {
  // Regression guard. Variance of the Laplacian is 0 here for the same reason
  // it is ~0 on a motion-blurred frame, so an implementation that leads with
  // sharpness reports a perfectly focused photo of nothing as "blurry".
  const score = scoreFrame(frame(() => 128))
  assert.equal(score.usable, false)
  assert.equal(score.reason, 'featureless')
  assert.ok(score.contrast < 1, `flat wall must have no contrast, got ${score.contrast}`)
})

test('a smooth gradient is featureless despite high contrast', () => {
  // An evenly washed wall: plenty of light-to-dark range across the frame,
  // but no detail anywhere in it.
  const score = scoreFrame(frame((x) => 60 + x * 2.5))
  assert.ok(score.contrast > 40, `expected real contrast, got ${score.contrast}`)
  assert.equal(score.usable, false)
  assert.equal(score.reason, 'featureless')
})

test('the inside of a pocket is rejected before any edge work', () => {
  const score = scoreFrame(frame(() => 6))
  assert.equal(score.usable, false)
  assert.equal(score.reason, 'too-dark')
  assert.equal(score.sharpness, 0, 'must not waste the Laplacian pass')
})

test('a blown-out frame is rejected', () => {
  const score = scoreFrame(frame(() => 250))
  assert.equal(score.usable, false)
  assert.equal(score.reason, 'too-bright')
})

test('blur degrades sharpness monotonically and eventually rejects', () => {
  const sharp = scoreFrame(signage)
  const light = scoreFrame(blur(signage, 2))
  const heavy = scoreFrame(blur(signage, 4))

  assert.ok(sharp.sharpness > light.sharpness, 'light blur must reduce sharpness')
  assert.ok(light.sharpness > heavy.sharpness, 'heavy blur must reduce it further')

  assert.equal(sharp.usable, true)
  assert.equal(heavy.usable, false, `heavy blur scored ${heavy.sharpness}`)
  assert.equal(heavy.reason, 'blurry', 'a blurred sign is blurry, not featureless')
})

test('a frame too small for the kernel is rejected rather than crashing', () => {
  const score = scoreFrame(frame(() => 128, 2, 2))
  assert.equal(score.usable, false)
  assert.equal(score.reason, 'too-small')
})
