/**
 * @file Tests for "did you mean…" candidate ranking.
 * Run: node --test src/services/localization/candidates.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { rankCandidates } from './candidates.js'

const STORES = [
  { name: 'MANYAVAR' },
  { name: "LEVI'S" },
  { name: 'METRO SHOES' },
  { name: 'H&M' },
  { name: 'PUMA' },
  { name: 'UNITED COLORS OF BENETTON' },
  { name: 'STARBUCKS' },
]

const names = (text) => rankCandidates(text, STORES).map((s) => s.name)

test('a store the mall does not have returns nothing', () => {
  // The regression. "any" is a substring of "m-any-avar", so naive substring
  // matching offered MANYAVAR for a Gucci query — a confident wrong answer
  // where "we don't have that" was correct.
  assert.deepEqual(names('any gucci store'), [])
  assert.deepEqual(names('where is gucci'), [])
  assert.deepEqual(names('is zara here'), [])
})

test('filler words alone never produce a suggestion', () => {
  for (const q of ['any store', 'where is the shop', 'i want something', 'show me places']) {
    assert.deepEqual(names(q), [], `"${q}" must not suggest anything`)
  }
})

test('a real brand is still found, punctuation and all', () => {
  assert.equal(names('levis')[0], "LEVI'S")
  assert.equal(names("where is levi's")[0], "LEVI'S")
  assert.equal(names('take me to puma')[0], 'PUMA')
})

test('a prefix of a brand still matches', () => {
  assert.equal(names('starbuck')[0], 'STARBUCKS')
  assert.equal(names('benetton')[0], 'UNITED COLORS OF BENETTON')
})

test('MANYAVAR is still reachable when actually asked for', () => {
  // The fix must not overcorrect into never suggesting the store at all.
  assert.equal(names('manyavar')[0], 'MANYAVAR')
  assert.equal(names('where is manyavar')[0], 'MANYAVAR')
})

test('an exact name outranks a partial one', () => {
  const ranked = names('metro')
  assert.equal(ranked[0], 'METRO SHOES')
})

test('never offers more than three', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `SHOE STORE ${i}` }))
  assert.ok(rankCandidates('shoe', many).length <= 3)
})

test('empty and junk input are safe', () => {
  assert.deepEqual(names(''), [])
  assert.deepEqual(names('   '), [])
  assert.deepEqual(rankCandidates('!!! ???', STORES), [])
  assert.deepEqual(rankCandidates('abc', []), [])
})
