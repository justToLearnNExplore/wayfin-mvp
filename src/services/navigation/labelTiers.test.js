/**
 * @file Tests for zoom-tiered map labelling.
 * Run: node --test src/services/navigation/labelTiers.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { labelPlan, nearestNames, makeLabelFilter } from './labelTiers.js'

const STORES = [
  { name: 'NEAR_1', x: 10, y: 10, type: 'store' },
  { name: 'NEAR_2', x: 12, y: 10, type: 'store' },
  { name: 'MID_1', x: 40, y: 40, type: 'store' },
  { name: 'FAR_1', x: 90, y: 90, type: 'store' },
  { name: 'FAR_2', x: 95, y: 95, type: 'store' },
]
const HERE = { x: 10, y: 10 }
const ATRIUM = { name: 'Atrium 1', x: 50, y: 50, type: 'atrium' }

test('zoom picks the right tier', () => {
  assert.equal(labelPlan(0.65).name, 'overview')
  assert.equal(labelPlan(1.0).name, 'overview')
  assert.equal(labelPlan(1.15).name, 'mid')
  assert.equal(labelPlan(1.5).name, 'mid')
  assert.equal(labelPlan(1.8).name, 'close')
  assert.equal(labelPlan(2.4).name, 'close')
})

test('the overview names nothing but route and structure', () => {
  const label = makeLabelFilter({ zoom: 0.7, onRoute: new Set(['MID_1']), stores: STORES, position: HERE })
  assert.equal(label(ATRIUM), true, 'structure always labels')
  assert.equal(label({ name: 'MID_1', type: 'store' }), true, 'route stops always label')
  assert.equal(label({ name: 'NEAR_1', type: 'store' }), false, 'nothing else at overview')
  assert.equal(label({ name: 'FAR_1', type: 'store' }), false)
})

test('close zoom names everything', () => {
  const label = makeLabelFilter({ zoom: 2.0, onRoute: new Set(), stores: STORES, position: HERE })
  for (const s of STORES) assert.equal(label(s), true, `${s.name} should label when fully zoomed`)
})

test('mid zoom prefers near over far', () => {
  const label = makeLabelFilter({ zoom: 1.3, onRoute: new Set(), stores: STORES, position: HERE })
  // Budget of 8 exceeds this fixture, so narrow it directly instead.
  const near = nearestNames(STORES, HERE, 2)
  assert.deepEqual([...near].sort(), ['NEAR_1', 'NEAR_2'])
  assert.equal(label({ name: 'NEAR_1', type: 'store' }), true)
})

test('a distant store never labels while a nearer one is hidden', () => {
  const near = nearestNames(STORES, HERE, 3)
  assert.equal(near.has('NEAR_1'), true)
  assert.equal(near.has('NEAR_2'), true)
  assert.equal(near.has('MID_1'), true)
  assert.equal(near.has('FAR_1'), false, 'the farthest must be dropped first')
  assert.equal(near.has('FAR_2'), false)
})

test('structure is never hidden at any zoom', () => {
  for (const zoom of [0.65, 1.0, 1.15, 1.8, 2.4]) {
    const label = makeLabelFilter({ zoom, onRoute: new Set(), stores: STORES, position: HERE })
    assert.equal(label(ATRIUM), true, `atrium hidden at zoom ${zoom}`)
    assert.equal(label({ name: 'Mall Entry 1', type: 'entry' }), true)
    assert.equal(label({ name: 'Parking Lift', type: 'lift' }), true)
  }
})

test('route stops label at every zoom', () => {
  const onRoute = new Set(['FAR_2'])
  for (const zoom of [0.65, 1.3, 2.4]) {
    const label = makeLabelFilter({ zoom, onRoute, stores: STORES, position: HERE })
    assert.equal(label({ name: 'FAR_2', type: 'store' }), true, `route stop hidden at zoom ${zoom}`)
  }
})

test('nearestNames handles the degenerate budgets', () => {
  assert.equal(nearestNames(STORES, HERE, 0).size, 0)
  assert.equal(nearestNames(STORES, HERE, Infinity).size, STORES.length)
  assert.equal(nearestNames([], HERE, 5).size, 0)
})

test('nearestNames does not mutate its input', () => {
  const before = STORES.map((s) => s.name)
  nearestNames(STORES, { x: 99, y: 99 }, 2)
  assert.deepEqual(STORES.map((s) => s.name), before)
})
