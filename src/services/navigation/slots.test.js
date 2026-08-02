/**
 * @file Tests for the two-slot conversation model.
 * Run: node --test src/services/navigation/slots.test.js
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptySlots,
  fillSlots,
  nextStep,
  isActionable,
  acknowledge,
  phraseTarget,
} from './slots.js'

const CATALOGUE = {
  'h&m': { id: 'G:H&M', name: 'H&M', floor: 'G' },
  starbucks: { id: 'UG:STARBUCKS', name: 'STARBUCKS', floor: 'UG' },
  puma: { id: 'G:PUMA', name: 'PUMA', floor: 'G' },
  'food court': { id: 'F2:Food Court', name: 'Food Court', floor: 'F2' },
}

/** Stand-in for the real catalogue lookup: unknown names resolve to null. */
const resolve = (name) => (name ? CATALOGUE[String(name).toLowerCase()] ?? null : null)

const parse = (over) => ({ intent: 'unknown', confidence: 0.9, ...over })

test('"im near H&M" fills origin even though the parser says unknown', () => {
  // The exact regression. The model labels a bare origin `unknown` because it
  // has no better option, and the old client threw the whole message away for
  // it — then offered H&M as a destination, routing the shopper to where they
  // were already standing.
  const { slots, filled } = fillSlots(emptySlots(), parse({ origin: 'H&M' }), resolve)

  assert.equal(slots.origin?.name, 'H&M')
  assert.equal(slots.destination, null, 'must NOT become the destination')
  assert.deepEqual(filled, ['origin'])
  assert.equal(nextStep(slots), 'ask-destination')
})

test('a message we understood is actionable regardless of the intent label', () => {
  const parsed = parse({ origin: 'H&M' })
  const { filled } = fillSlots(emptySlots(), parsed, resolve)
  assert.equal(isActionable(parsed, filled), true)
})

test('a genuinely empty message is not actionable', () => {
  const parsed = parse({ intent: 'unknown' })
  const { filled } = fillSlots(emptySlots(), parsed, resolve)
  assert.equal(isActionable(parsed, filled), false)
})

test('both slots in one sentence go straight to routing', () => {
  const { slots, filled } = fillSlots(
    emptySlots(),
    parse({ intent: 'navigate', origin: 'H&M', destination: 'STARBUCKS' }),
    resolve
  )
  assert.equal(slots.origin?.name, 'H&M')
  assert.equal(slots.destination?.name, 'STARBUCKS')
  assert.deepEqual(filled.sort(), ['destination', 'origin'])
  assert.equal(nextStep(slots), 'route')
})

test('a later message never wipes a slot it does not mention', () => {
  // "It asked me again" — the complaint this rule exists to kill.
  let { slots } = fillSlots(emptySlots(), parse({ origin: 'H&M' }), resolve)
  ;({ slots } = fillSlots(slots, parse({ intent: 'navigate', destination: 'PUMA' }), resolve))

  assert.equal(slots.origin?.name, 'H&M', 'origin must survive')
  assert.equal(slots.destination?.name, 'PUMA')
  assert.equal(nextStep(slots), 'route')
})

test('changing your mind replaces the destination and keeps the origin', () => {
  let { slots } = fillSlots(
    emptySlots(),
    parse({ intent: 'navigate', origin: 'H&M', destination: 'PUMA' }),
    resolve
  )
  ;({ slots } = fillSlots(slots, parse({ intent: 'navigate', destination: 'STARBUCKS' }), resolve))

  assert.equal(slots.origin?.name, 'H&M')
  assert.equal(slots.destination?.name, 'STARBUCKS')
})

test('a name the catalogue rejects fills nothing', () => {
  // Anti-hallucination boundary: the model may say "GUCCI"; it never lands.
  const { slots, filled } = fillSlots(
    emptySlots(),
    parse({ intent: 'navigate', destination: 'GUCCI' }),
    resolve
  )
  assert.equal(slots.destination, null)
  assert.deepEqual(filled, [])
})

test('one good name and one bad one keeps the good one', () => {
  const { slots, filled } = fillSlots(
    emptySlots(),
    parse({ intent: 'navigate', origin: 'H&M', destination: 'ZARA' }),
    resolve
  )
  assert.equal(slots.origin?.name, 'H&M', 'the resolvable half must survive')
  assert.equal(slots.destination, null)
  assert.deepEqual(filled, ['origin'])
  assert.equal(nextStep(slots), 'ask-destination')
})

test('low confidence fills nothing', () => {
  const { slots, filled } = fillSlots(
    emptySlots(),
    parse({ intent: 'navigate', destination: 'PUMA', confidence: 0.2 }),
    resolve
  )
  assert.equal(slots.destination, null)
  assert.deepEqual(filled, [])
})

test('a friend location never becomes our own origin', () => {
  const { slots } = fillSlots(
    emptySlots(),
    parse({ intent: 'friend', friendLocation: 'Food Court' }),
    resolve
  )
  assert.equal(slots.origin, null)
  assert.equal(slots.destination, null)
})

test('nextStep covers every combination', () => {
  const o = CATALOGUE['h&m']
  const d = CATALOGUE.puma
  assert.equal(nextStep({ origin: null, destination: null }), 'ask-both')
  assert.equal(nextStep({ origin: o, destination: null }), 'ask-destination')
  assert.equal(nextStep({ origin: null, destination: d }), 'ask-origin')
  assert.equal(nextStep({ origin: o, destination: d }), 'route')
})

test('the bot names what it just understood before asking for more', () => {
  const slots = { origin: CATALOGUE['h&m'], destination: null }
  assert.match(acknowledge(slots, ['origin']), /H&M/)
  assert.match(acknowledge(slots, ['origin']), /Where do you want to go/)

  const withDest = { origin: null, destination: CATALOGUE.starbucks }
  assert.match(acknowledge(withDest, ['destination']), /STARBUCKS/)
  assert.match(acknowledge(withDest, ['destination']), /Where are you/)

  assert.match(acknowledge(emptySlots(), []), /where you are/i)
})

// ---- offline phrase targeting ---------------------------------------------

test('"near X" phrasing targets the origin slot', () => {
  for (const t of ["im near H&M", "i'm at starbucks", 'outside puma', 'standing by the food court']) {
    assert.equal(phraseTarget(t), 'origin', `"${t}" should read as an origin`)
  }
})

test('"take me to X" phrasing targets the destination slot', () => {
  for (const t of ['take me to puma', 'where is sephora', 'how do i get to uniqlo', 'directions to max']) {
    assert.equal(phraseTarget(t), 'destination', `"${t}" should read as a destination`)
  }
})

test('a sentence with both cues is a destination request', () => {
  // Getting this backwards routes someone to where they already stand.
  assert.equal(phraseTarget('im near H&M take me to puma'), 'destination')
})

test('a bare store name gives no clue, and says so', () => {
  assert.equal(phraseTarget('sephora'), null)
  assert.equal(phraseTarget(''), null)
  assert.equal(phraseTarget(undefined), null)
})
