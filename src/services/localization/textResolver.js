/**
 * @file Natural-language → landmark resolution, entirely offline.
 *
 * Handles the phrasings people actually use when saying where they are:
 *   "I'm outside H&M" · "near the escalator" · "food court" · "mall entrance"
 *
 * Deliberately deterministic and key-free. The LLM intent parser is a useful
 * *upgrade* for messy phrasing, but localization must never hard-depend on a
 * network round trip — a shopper standing in a corridor with bad wifi still
 * needs to be found. Callers may try the LLM first and fall back to this, or
 * use this alone.
 */

import { CATALOGUE } from '../vision/catalogue.js'

/**
 * @typedef {import('../vision/catalogue.js').CatalogueEntry} CatalogueEntry
 * @typedef {import('../vision/catalogue.js').LandmarkMatch} LandmarkMatch
 */

/**
 * Positional filler that carries no landmark information. Stripped before
 * matching so "i am standing right outside the h&m" reduces to "h&m".
 */
const FILLER = [
  "i'm", 'i am', 'im', 'i", "m', 'we are', "we're",
  'standing', 'currently', 'right', 'just', 'here', 'now',
  'outside', 'inside', 'near', 'nearby', 'next to', 'beside', 'by the', 'by',
  'in front of', 'front of', 'opposite', 'across from', 'at the', 'at', 'in the', 'in',
  'the', 'a', 'an', 'close to', 'around', 'somewhere', 'entrance of',
  // Generic retail nouns people append to a brand name.
  'store', 'shop', 'outlet', 'showroom',
]

/** Common spoken synonyms → the catalogue term they mean. */
const SYNONYMS = /** @type {Record<string, string>} */ ({
  escalator: 'Atrium 1',
  escalators: 'Atrium 1',
  elevator: 'Parking Lift',
  lift: 'Parking Lift',
  entrance: 'Mall Entry 2',
  entry: 'Mall Entry 2',
  'main entrance': 'Mall Entry 2',
  'main gate': 'Mall Entry 2',
  gate: 'Mall Entry 2',
  foodcourt: 'Food Court',
  'food court': 'Food Court',
  atrium: 'Atrium 1',
  cinema: 'PVR',
  movies: 'PVR',
  parking: 'Parking Lift',
  basement: 'Parking Lift',
})

/**
 * Lowercase, strip punctuation, collapse whitespace.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text
    .toLowerCase()
    // Apostrophes are ELIDED, not spaced: "LEVI'S" must become "levis" so it
    // matches how people type and how ASR transcribes it. Spacing it would
    // produce "levi s", which matches nothing.
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Remove positional filler words/phrases.
 * @param {string} text
 * @returns {string}
 */
function stripFiller(text) {
  let out = ` ${text} `
  // Longest phrases first so "in front of" beats "in".
  for (const phrase of [...FILLER].sort((a, b) => b.length - a.length)) {
    out = out.split(` ${phrase} `).join(' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * @typedef {Object} TextResolution
 * @property {'match' | 'ambiguous' | 'suggestions' | 'none'} status
 * @property {string} query        The cleaned query actually matched on.
 * @property {CatalogueEntry} [entry]
 * @property {LandmarkMatch[]} [matches]
 * @property {CatalogueEntry[]} [candidates] Ranked alternatives to offer.
 */

/**
 * Score how well a catalogue name matches a query. Higher is better; 0 means
 * no match at all.
 * @param {string} query normalized+stripped
 * @param {string} name normalized catalogue name
 * @returns {number}
 */
function score(query, name) {
  if (!query || !name) return 0
  if (query === name) return 100
  if (name.startsWith(query) || query.startsWith(name)) return 80
  if (name.includes(query) || query.includes(name)) return 60

  // Token overlap — catches "victoria secret" vs "victoria's secret" and
  // word-order differences.
  const queryTokens = new Set(query.split(' ').filter((t) => t.length > 1))
  const nameTokens = name.split(' ').filter((t) => t.length > 1)
  if (queryTokens.size === 0 || nameTokens.length === 0) return 0

  const hits = nameTokens.filter((t) => queryTokens.has(t)).length
  if (hits === 0) return 0
  return 30 * (hits / Math.max(queryTokens.size, nameTokens.length)) + 10 * hits
}

/**
 * Resolve free text to a landmark in the mall.
 *
 * @param {string} input Raw user text or voice transcript.
 * @returns {TextResolution}
 */
export function resolveLocationText(input) {
  const cleaned = stripFiller(normalize(input ?? ''))
  if (!cleaned) return { status: 'none', query: '' }

  // Synonym pass: map spoken words onto catalogue terms before scoring.
  const synonymTarget = SYNONYMS[cleaned] ?? null
  const query = synonymTarget ? normalize(synonymTarget) : cleaned

  /** @type {{entry: CatalogueEntry, points: number}[]} */
  const ranked = []
  for (const entry of CATALOGUE.values()) {
    const points = score(query, normalize(entry.name))
    if (points > 0) ranked.push({ entry, points })
  }

  // Also try synonyms embedded in a longer phrase ("near the escalator on 2").
  if (ranked.length === 0) {
    for (const [word, target] of Object.entries(SYNONYMS)) {
      if (query.includes(word)) {
        const entry = CATALOGUE.get(target.toUpperCase())
        if (entry) ranked.push({ entry, points: 55 })
        break
      }
    }
  }

  if (ranked.length === 0) return { status: 'none', query }

  ranked.sort((a, b) => b.points - a.points)
  const best = ranked[0]

  // A weak or contested best guess becomes a pick-list rather than a silent
  // (and possibly wrong) placement.
  const contested = ranked.length > 1 && ranked[1].points >= best.points - 5
  if (best.points < 55 || contested) {
    const candidates = ranked.slice(0, 5).map((r) => r.entry)
    // A "pick one" list of exactly one option is just a match with extra
    // friction — promote it.
    if (candidates.length > 1) return { status: 'suggestions', query, candidates }
    return {
      status: best.entry.ambiguous ? 'ambiguous' : 'match',
      query,
      entry: best.entry,
      matches: best.entry.matches,
    }
  }

  return {
    status: best.entry.ambiguous ? 'ambiguous' : 'match',
    query,
    entry: best.entry,
    matches: best.entry.matches,
  }
}
