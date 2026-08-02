/**
 * @file The two things the assistant needs, and what to ask for next.
 *
 * WHY THIS EXISTS. The chat used to be flow-first: pick a store, and only then
 * be told what else was needed. Anything offered out of that order fell on the
 * floor. Saying "I'm near H&M" produced `intent: unknown` from the parser (it
 * had no better label available), the client discarded the whole message for
 * carrying that label, and then offered H&M back as a DESTINATION — routing a
 * shopper to the spot they were already standing on.
 *
 * So the model is inverted. There are exactly two slots — where you are and
 * where you're going — and every input is treated as an attempt to fill one or
 * both. Order does not matter. A slot once filled is never silently dropped,
 * and the assistant only ever asks for what is genuinely still missing.
 *
 * The rules live here, pure and tested, rather than inside the component:
 * this is the logic that decides what the bot says next, and it earned tests
 * by getting it wrong in front of a user.
 *
 * ROUTING IS NOT DONE HERE. This decides what is known and what to ask; the
 * deterministic Dijkstra engine still computes every path.
 */

/**
 * @typedef {Object} ResolvedPlace
 * @property {string} id    Graph node id.
 * @property {string} name
 * @property {string} floor
 */

/**
 * @typedef {Object} Slots
 * @property {ResolvedPlace | null} origin
 * @property {ResolvedPlace | null} destination
 */

/**
 * @typedef {Object} ParsedIntent
 * @property {string} intent
 * @property {string | null} [origin]
 * @property {string | null} [destination]
 * @property {string | null} [category]
 * @property {string | null} [friendLocation]
 * @property {string | null} [parkingLevel]
 * @property {number} confidence
 */

/**
 * Below this we do not trust a name enough to fill a slot with it silently.
 *
 * Deliberately lower than it looks: the name has ALREADY survived lookup
 * against the real catalogue by the time it gets here, so a wrong-but-resolving
 * name is rare. The confidence gate is about the model's reading of the
 * sentence ("did they mean this as an origin or a destination"), not about
 * whether the store exists.
 */
export const SLOT_CONFIDENCE = 0.55

/** @returns {Slots} */
export const emptySlots = () => ({ origin: null, destination: null })

/**
 * Merge a parsed intent into the slots we already hold.
 *
 * Never clears a slot it cannot improve: a message that mentions only a
 * destination must not wipe an origin the shopper gave two turns ago. That
 * one rule removes most of the "it asked me again" complaints.
 *
 * @param {Slots} slots Current state.
 * @param {ParsedIntent} parsed
 * @param {(name: string | null | undefined, parkingLevel?: string | null) => ResolvedPlace | null} resolve
 *   Catalogue lookup. Anything it rejects is discarded — the model never
 *   invents a place that reaches the slots.
 * @returns {{slots: Slots, filled: ('origin'|'destination')[]}}
 */
export function fillSlots(slots, parsed, resolve) {
  const next = { ...slots }
  /** @type {('origin'|'destination')[]} */
  const filled = []

  if (!parsed || parsed.confidence < SLOT_CONFIDENCE) return { slots: next, filled }

  const level = parsed.parkingLevel ?? null

  const origin = resolve(parsed.origin, level)
  if (origin) {
    next.origin = origin
    filled.push('origin')
  }

  // A friend's location is a place too, but it is never OUR origin, so it is
  // deliberately not merged here — the friend flow owns it.
  const destination = resolve(parsed.destination, level)
  if (destination) {
    next.destination = destination
    filled.push('destination')
  }

  return { slots: next, filled }
}

/**
 * @typedef {'route' | 'ask-origin' | 'ask-destination' | 'ask-both'} NextStep
 */

/**
 * What should happen now, given what we know.
 *
 * @param {Slots} slots
 * @returns {NextStep}
 */
export function nextStep(slots) {
  if (slots.origin && slots.destination) return 'route'
  if (slots.origin) return 'ask-destination'
  if (slots.destination) return 'ask-origin'
  return 'ask-both'
}

/**
 * Is this a message we understood well enough to act on at all?
 *
 * `unknown` from the parser is not sufficient grounds to discard a message —
 * that was the original bug. A message is only useless when nothing in it
 * resolved AND no other actionable intent was recognised.
 *
 * @param {ParsedIntent} parsed
 * @param {('origin'|'destination')[]} filled
 * @returns {boolean}
 */
export function isActionable(parsed, filled) {
  if (filled.length > 0) return true
  return ['navigate', 'set_origin', 'friend', 'parking', 'offers', 'store_search'].includes(
    parsed?.intent
  )
}

/** Phrasings that describe where the speaker currently is. */
const ORIGIN_RE = /\b(?:i'?m|i am|im)?\s*(?:near|at|outside|beside|next to|standing|currently|right now|here at|by the)\b/i

/** Phrasings that describe where they want to end up. */
const DESTINATION_RE = /\b(?:take me|go to|going to|get me|route|navigate|directions?|where is|find|show me|how do i (?:get|reach)|to the)\b/i

/**
 * Which slot is this sentence aiming at?
 *
 * Used by the OFFLINE path, where there is no model to label the intent and we
 * have only the words. Matters because the same store name means opposite
 * things in "I'm near H&M" and "take me to H&M", and getting it backwards
 * routes someone to the spot they are standing on.
 *
 * A sentence containing both cues is a destination: "I'm near H&M, take me to
 * PUMA" is fundamentally a request to go somewhere, and the origin half is
 * recovered separately by resolving the place names.
 *
 * @param {string | null | undefined} text
 * @returns {'origin' | 'destination' | null} null when the phrasing gives no clue.
 */
export function phraseTarget(text) {
  const t = String(text ?? '')
  const dest = DESTINATION_RE.test(t)
  const origin = ORIGIN_RE.test(t)
  if (dest) return 'destination'
  if (origin) return 'origin'
  return null
}

/**
 * The line the bot says after slots change.
 *
 * Acknowledges what was just understood before asking for the rest, because a
 * bare re-prompt reads as though the app ignored you.
 *
 * @param {Slots} slots
 * @param {('origin'|'destination')[]} filled
 * @returns {string}
 */
export function acknowledge(slots, filled) {
  const step = nextStep(slots)

  if (step === 'route') {
    return filled.length === 2
      ? `${slots.origin?.name} to ${slots.destination?.name} — let's go.`
      : `Got it. ${slots.origin?.name} to ${slots.destination?.name}.`
  }

  if (step === 'ask-destination') {
    return filled.includes('origin')
      ? `Got it — you're at ${slots.origin?.name}. Where do you want to go?`
      : 'Where do you want to go?'
  }

  if (step === 'ask-origin') {
    return filled.includes('destination')
      ? `${slots.destination?.name} it is. Where are you right now?`
      : 'Where are you right now?'
  }

  return "Tell me where you are, where you're going, or both."
}
