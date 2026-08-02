/**
 * @file Tests for destination type-ahead.
 * Run: node --test src/services/navigation/storeSearch.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { searchStores, categoriesBySize, fold } from './storeSearch.js'

const ITEMS = [
  { name: 'STARBUCKS', category: 'Food', floor: 'UG' },
  { name: 'STEVE MADDEN', category: 'Footwear', floor: 'G' },
  { name: 'STRIDE', category: 'Footwear', floor: 'UG' },
  { name: 'WESTSIDE', category: 'Fashion', floor: 'G' },
  { name: "LEVI'S", category: 'Fashion', floor: 'G' },
  { name: 'H&M', category: 'Fashion', floor: 'G' },
  { name: 'MAX', category: 'Fashion', floor: 'F1' },
  { name: 'MARKS & SPENCER LINGERIE', category: 'Innerwear', floor: 'G' },
  { name: 'PUMA', category: 'Sportswear', floor: 'G' },
]

const names = (q, opts) => searchStores(q, ITEMS, opts).map((i) => i.name)

test('prefix matches lead, not mere containment', () => {
  // WESTSIDE contains "st" but nobody typing "sta" wants it. Ranking by
  // containment puts the wrong answer first and the field feels broken.
  const r = names('sta')
  assert.equal(r[0], 'STARBUCKS')
  assert.ok(!r.includes('WESTSIDE'), `WESTSIDE should not match "sta", got ${r}`)
})

test('punctuation and case are irrelevant', () => {
  assert.equal(names('levis')[0], "LEVI'S")
  assert.equal(names("LEVI'S")[0], "LEVI'S")
  assert.equal(names('hm')[0], 'H&M')
  assert.equal(names('h&m')[0], 'H&M')
})

test('a later word in the name is matchable', () => {
  // "madden" is how people refer to STEVE MADDEN.
  assert.equal(names('madden')[0], 'STEVE MADDEN')
})

test('an exact match outranks a longer prefix match', () => {
  assert.equal(names('max')[0], 'MAX')
})

test('the shorter name wins a tie', () => {
  const r = names('m')
  assert.ok(
    r.indexOf('MAX') < r.indexOf('MARKS & SPENCER LINGERIE'),
    `expected MAX before the longer name, got ${r}`
  )
})

test('a category name finds its stores', () => {
  assert.ok(names('foot').includes('STEVE MADDEN'))
})

test('an empty query returns nothing', () => {
  // A list that appears before you type is noise.
  assert.deepEqual(names(''), [])
  assert.deepEqual(names('   '), [])
  assert.deepEqual(names('!!!'), [])
})

test('nonsense returns nothing rather than a wrong guess', () => {
  assert.deepEqual(names('gucci'), [])
  assert.deepEqual(names('zzzz'), [])
})

test('the limit is respected', () => {
  assert.ok(searchStores('s', ITEMS, { limit: 2 }).length <= 2)
})

test('browse lists the biggest categories first', () => {
  const cats = categoriesBySize(ITEMS)
  assert.equal(cats[0].category, 'Fashion')
  assert.equal(cats[0].count, 4)
  assert.ok(cats.every((c, i) => i === 0 || cats[i - 1].count >= c.count))
})

test('fold is stable for the awkward real names', () => {
  assert.equal(fold("LEVI'S"), 'levis')
  assert.equal(fold('H&M'), 'hm')
  assert.equal(fold('MARKS & SPENCER LINGERIE'), 'marksspencerlingerie')
})
