/**
 * @file "Did you mean…" ranking for store names the parser could not resolve.
 *
 * Extracted from BotChat and given tests because it shipped a bug that was
 * embarrassing in front of a user: asking for "any gucci store" offered
 * MANYAVAR. Gucci is not in the mall, so the right answer was "we don't have
 * that" — instead the matcher scored a hit because "any" is a substring of
 * "m-any-avar", and the bot confidently recommended an unrelated brand.
 *
 * Two rules prevent that class of mistake:
 *
 *   STOPWORDS      filler words carry no brand information and must never
 *                  score. "any", "store", "where" and friends are dropped
 *                  before matching begins.
 *   WORD BOUNDARY  a query word must begin a word of the brand name (or vice
 *                  versa) rather than appear anywhere inside it. "levi" still
 *                  finds LEVI'S; "any" can no longer reach MANYAVAR.
 *
 * Returning nothing is a perfectly good answer here. An empty list lets the
 * caller say "we don't have that at Orion", which is more useful to a shopper
 * than a confident wrong suggestion.
 */

/** Punctuation-insensitive, so "levis" matches "LEVI'S". */
export const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '')

/** Words that say nothing about which shop is meant. */
export const STOPWORDS = new Set([
  'the', 'and', 'any', 'for', 'near', 'from', 'get', 'got', 'take', 'find',
  'where', 'what', 'which', 'who', 'how', 'was',
  'store', 'stores', 'shop', 'shops', 'outlet', 'outlets', 'showroom',
  'section', 'place', 'places', 'shopping',
  'want', 'need', 'needs', 'looking', 'look', 'like', 'this', 'that',
  'there', 'here', 'you', 'your', 'have', 'has', 'can', 'please', 'show',
  'some', 'anything', 'something', 'about', 'with', 'into', 'let',
])

/** Most candidates we will ever offer — beyond three it stops being a hint. */
const MAX_CANDIDATES = 3

/**
 * Rank stores against a free-text query.
 *
 * @param {string} text Raw user text.
 * @param {{name: string}[]} stores Catalogue to match against.
 * @returns {any[]} Up to 3 candidates, best first. Empty when nothing matches.
 */
export function rankCandidates(text, stores) {
  const q = norm(text).trim()
  if (!q) return []

  const words = q.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  if (!words.length) return []

  return stores
    .map((store) => {
      const name = norm(store.name)
      const nameWords = name.split(/\s+/).filter(Boolean)
      let score = 0

      // Whole-name hits, strongest first.
      if (name === q) score += 4
      else if (q.includes(name) || name.includes(q)) score += 3

      // Per-word hits, anchored to word starts so no filler can sneak in.
      for (const w of words) {
        if (nameWords.some((nw) => nw.startsWith(w) || w.startsWith(nw))) score += 1
      }

      return /** @type {[number, any]} */ ([score, store])
    })
    .filter(([score]) => score > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_CANDIDATES)
    .map(([, store]) => store)
}
