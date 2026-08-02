/**
 * @file Type-ahead search across the whole catalogue.
 *
 * Distinct from candidates.js, which answers "you said something I don't
 * recognise — did you mean one of these?" and deliberately returns nothing
 * when unsure. This answers "you are typing, show me what matches", where
 * being generous is correct and returning nothing is a dead end.
 *
 * The two rank differently for that reason. Autocomplete leads with PREFIX
 * matches, because someone typing "sta" is far more likely to want STARBUCKS
 * than WESTSIDE — even though both contain the letters. Ranking by mere
 * containment puts the wrong answer first and makes the field feel broken.
 *
 * Why this matters beyond convenience: 132 stores cannot all carry labels on a
 * phone-sized map. Search is what makes the long tail reachable, so it carries
 * the weight of "why can't I find my shop" rather than the map having to.
 */

/** Fold case and punctuation so "levis" finds "LEVI'S" and "h&m" finds "H&M". */
export const fold = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Same, but keeping spaces so word-start matching still works. */
const foldWords = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

/** Ranked above everything else: the user typed the name exactly. */
const EXACT = 1000
/** The name starts with what they typed — the autocomplete case. */
const PREFIX = 500
/** A later word in the name starts with it: "madden" → STEVE MADDEN. */
const WORD_PREFIX = 250
/** The letters appear somewhere: last resort, still useful. */
const CONTAINS = 100

/**
 * @typedef {Object} SearchItem
 * @property {string} name
 * @property {string} [category]
 * @property {string} [floor]
 */

/**
 * Rank catalogue entries against a partial query.
 *
 * @param {string} query What has been typed so far.
 * @param {SearchItem[]} items
 * @param {{limit?: number}} [options]
 * @returns {SearchItem[]} Best first. Empty for an empty query — an
 *   autocomplete list that appears before you type is noise.
 */
export function searchStores(query, items, options = {}) {
  const limit = options.limit ?? 8
  const q = fold(query)
  if (!q) return []

  const scored = []

  for (const item of items) {
    const name = fold(item.name)
    const words = foldWords(item.name).split(/\s+/).filter(Boolean)

    let score = 0
    if (name === q) score = EXACT
    else if (name.startsWith(q)) score = PREFIX
    else if (words.some((w) => w.startsWith(q))) score = WORD_PREFIX
    else if (name.includes(q)) score = CONTAINS
    else if (item.category && fold(item.category).startsWith(q)) score = CONTAINS - 20

    if (!score) continue

    // Among equal matches prefer the shorter name: typing "max" should surface
    // MAX before MARKS & SPENCER LINGERIE.
    scored.push([score - Math.min(name.length, 60) / 100, item])
  }

  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([, item]) => item)
}

/**
 * Group items by category, for the browse view.
 *
 * Categories are sorted by how many stores they hold, so the ones worth
 * browsing appear first rather than whichever happens to be alphabetically
 * lucky.
 *
 * @param {SearchItem[]} items
 * @returns {{category: string, count: number}[]}
 */
export function categoriesBySize(items) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const item of items) {
    if (!item.category) continue
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}
