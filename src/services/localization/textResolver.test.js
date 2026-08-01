/**
 * @file Tests for offline natural-language localization.
 * Run: node --test src/services/localization/textResolver.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLocationText } from './textResolver.js'

/** @param {string} input */
const resolve = (input) => resolveLocationText(input)

test('resolves the phrasings from the product brief', () => {
  assert.equal(resolve("I'm outside H&M").matches?.[0].nodeId, 'G:H&M')
  assert.equal(resolve('Food court').matches?.[0].nodeId, 'F2:Food Court')
  // An escalator photo/phrase cannot identify a floor — must stay ambiguous.
  assert.equal(resolve('Near the escalator').status, 'ambiguous')
  // Three real entrances exist, so offering a choice is correct, not a failure.
  assert.equal(resolve('Mall entrance').status, 'suggestions')
})

test('strips positional filler and retail nouns', () => {
  assert.equal(resolve('im standing right outside the levis store').matches?.[0].nodeId, "G:LEVI'S")
  assert.equal(resolve('next to the sephora shop').matches?.[0].nodeId, 'G:SEPHORA')
  assert.equal(resolve('beside uniqlo').matches?.[0].nodeId, 'G:UNIQLO')
})

test('elides apostrophes rather than spacing them', () => {
  // "LEVI'S" must normalise to "levis", not "levi s" — ASR and typing both
  // drop the apostrophe.
  assert.equal(resolve('levis').matches?.[0].nodeId, "G:LEVI'S")
  assert.equal(resolve('victoria secret').matches?.[0].nodeId, "G:VICTORIA'S SECRET")
})

test('flags multi-floor landmarks instead of guessing a floor', () => {
  const pvr = resolve('i am at pvr')
  assert.equal(pvr.status, 'ambiguous')
  assert.equal(pvr.matches?.length, 2)

  const parking = resolve('parking')
  assert.equal(parking.status, 'ambiguous')
  assert.ok((parking.matches?.length ?? 0) > 2)
})

test('never invents a store that is not in the mall', () => {
  // Zara is a real brand but not an Orion tenant — honesty beats a guess.
  assert.equal(resolve('zara').status, 'none')
  assert.equal(resolve('blah blah nonsense').status, 'none')
  assert.equal(resolve('').status, 'none')
})

test('a single weak candidate is promoted, not offered as a list of one', () => {
  const result = resolve('victoria secret')
  assert.notEqual(result.status, 'suggestions')
  assert.ok(result.matches?.length)
})
