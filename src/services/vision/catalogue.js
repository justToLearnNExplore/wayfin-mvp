/**
 * @file The visual landmark catalogue — the closed vocabulary the vision model
 * is allowed to answer with.
 *
 * Derived entirely from the existing mall dataset so there is exactly one
 * source of truth: adding a store to `stores.js` automatically makes it
 * recognisable, with no prompt edits.
 *
 * ANTI-HALLUCINATION CONTRACT: the model may only return a `name` that appears
 * in this catalogue. The server re-validates every response against it and
 * discards anything else. The model never supplies coordinates, floors or node
 * ids — those are resolved here, from our own data.
 *
 * FLOOR AMBIGUITY: a photo of an escalator looks the same on every level, and
 * some brands trade on more than one floor. Those entries are flagged
 * `ambiguous`, and the UI resolves them with a single follow-up tap rather
 * than guessing.
 */

import { FLOORS, LANDMARKS, PARKING_NODES } from '../../data/stores.js'
import { floorLabelOf } from '../../lib/routing.js'

/**
 * @typedef {Object} LandmarkMatch
 * @property {string} nodeId     Graph node id, e.g. 'G:H&M'.
 * @property {string} name
 * @property {string} floor
 * @property {string} floorLabel
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} CatalogueEntry
 * @property {string} name
 * @property {'store' | 'structure'} kind
 * @property {string} [category]
 * @property {boolean} ambiguous  True when the name exists on several floors.
 * @property {LandmarkMatch[]} matches
 */

/**
 * Build the catalogue, grouping every landmark name to the node(s) it maps to.
 * @returns {Map<string, CatalogueEntry>} keyed by UPPERCASE name.
 */
function build() {
  /** @type {Map<string, CatalogueEntry>} */
  const byName = new Map()

  /**
   * @param {string} name
   * @param {'store'|'structure'} kind
   * @param {string} floor
   * @param {number} x
   * @param {number} y
   * @param {string} [category]
   */
  const add = (name, kind, floor, x, y, category) => {
    const key = name.toUpperCase()
    const entry = byName.get(key) ?? { name, kind, category, ambiguous: false, matches: [] }
    entry.matches.push({
      nodeId: `${floor}:${name}`,
      name,
      floor,
      floorLabel: floorLabelOf(floor),
      x,
      y,
    })
    entry.ambiguous = entry.matches.length > 1
    byName.set(key, entry)
  }

  for (const floor of FLOORS) {
    for (const store of floor.stores) {
      add(store.name, 'store', floor.id, store.x, store.y, store.category)
    }
  }
  for (const landmark of LANDMARKS) {
    add(landmark.name, 'structure', landmark.floor, landmark.x, landmark.y)
  }
  for (const node of PARKING_NODES) {
    add(node.name, 'structure', node.floor, node.x, node.y)
  }

  return byName
}

/** @type {Map<string, CatalogueEntry>} */
export const CATALOGUE = build()

/**
 * Resolve a model-supplied landmark name to concrete graph nodes.
 * Returns null for anything not in the catalogue — this is the validation
 * boundary that makes a hallucinated store name harmless.
 *
 * @param {string | null | undefined} name
 * @returns {CatalogueEntry | null}
 */
export function resolveLandmark(name) {
  if (!name || typeof name !== 'string') return null
  return CATALOGUE.get(name.trim().toUpperCase()) ?? null
}

/**
 * The catalogue rendered for a prompt: one line per recognisable landmark.
 * Structures are listed once (they repeat per floor) to keep the prompt tight.
 * @returns {string}
 */
export function cataloguePromptLines() {
  /** @type {string[]} */
  const stores = []
  /** @type {string[]} */
  const structures = []

  for (const entry of CATALOGUE.values()) {
    if (entry.kind === 'store') {
      const floors = entry.matches.map((m) => m.floorLabel).join(' / ')
      stores.push(`- ${entry.name} (${entry.category ?? 'store'}, ${floors})`)
    } else {
      structures.push(`- ${entry.name}`)
    }
  }

  return `STORE SIGNAGE (brand logos / shopfronts):\n${stores.join('\n')}\n\nSTRUCTURAL LANDMARKS (appear on multiple floors):\n${[...new Set(structures)].join('\n')}`
}
