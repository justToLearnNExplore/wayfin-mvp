/**
 * @file How many store names the map shows, as a function of zoom.
 *
 * With 38 stores on a floor, labelling all of them at phone size produces an
 * unreadable smear — but hiding them makes the map look like it does not know
 * the mall. Zoom resolves the conflict the way every map app does: the overview
 * carries only what you navigate BY, and detail arrives as you ask for it.
 *
 * Three tiers:
 *
 *   OVERVIEW  route stops and structure only — atriums, lifts, entries. These
 *             are the things a person steers by from across a floor.
 *   MID       plus the nearest stores, because when you are lost the shop you
 *             can see out of the corner of your eye is the one worth naming.
 *   CLOSE     everything. This is where "show me all the stores" is answered,
 *             without that answer wrecking the overview.
 *
 * Proximity beats tier within a level: a distant store never labels while a
 * nearer one of the same kind stays anonymous.
 */

/**
 * Tier thresholds, in map scale units. The map's own zoom runs 0.65..2.4, so
 * these sit at roughly the one-third and two-thirds marks of that travel.
 * @type {{minZoom: number, nearby: number, all: boolean, name: string}[]}
 */
export const TIERS = [
  { minZoom: 0, nearby: 0, all: false, name: 'overview' },
  { minZoom: 1.15, nearby: 8, all: false, name: 'mid' },
  { minZoom: 1.8, nearby: Infinity, all: true, name: 'close' },
]

/**
 * Resolve the labelling budget for a zoom level.
 * @param {number} zoom
 * @returns {{nearby: number, all: boolean, name: string}}
 */
export function labelPlan(zoom) {
  let plan = TIERS[0]
  for (const tier of TIERS) if (zoom >= tier.minZoom) plan = tier
  return { nearby: plan.nearby, all: plan.all, name: plan.name }
}

/**
 * Names of the `count` nodes closest to a point.
 *
 * Distances are in raw map units rather than metres on purpose: this only ever
 * ranks candidates against each other on one floor, so the axis scaling that
 * `distanceMetres` applies would change nothing but the numbers.
 *
 * @param {{name: string, x: number, y: number}[]} nodes
 * @param {{x: number, y: number}} origin
 * @param {number} count
 * @returns {Set<string>}
 */
export function nearestNames(nodes, origin, count) {
  if (!Number.isFinite(count)) return new Set(nodes.map((n) => n.name))
  if (count <= 0) return new Set()

  return new Set(
    [...nodes]
      .sort(
        (a, b) =>
          Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)
      )
      .slice(0, count)
      .map((n) => n.name)
  )
}

/**
 * Build the predicate the map uses to decide whether a node gets a name.
 *
 * @param {Object} params
 * @param {number} params.zoom
 * @param {Set<string>} params.onRoute      Names that are stops on the route.
 * @param {{name: string, x: number, y: number, type?: string}[]} params.stores
 * @param {{x: number, y: number}} params.position Where the user is.
 * @returns {(node: {name: string, type?: string}) => boolean}
 */
export function makeLabelFilter({ zoom, onRoute, stores, position }) {
  const plan = labelPlan(zoom)
  const near = plan.all ? null : nearestNames(stores, position, plan.nearby)

  return (node) => {
    // Structure is never hidden: atriums, lifts and entries are how someone
    // orients at any zoom, and there are few enough that they never crowd.
    if (node.type && node.type !== 'store') return true
    if (onRoute.has(node.name)) return true
    if (plan.all) return true
    return near?.has(node.name) ?? false
  }
}
