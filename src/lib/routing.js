// Walk-graph routing for Orion Mall.
// Nodes = stores + entries + atriums; same-floor edges link each node to its
// nearest neighbours, and the two atriums carry escalator edges between
// adjacent floors. Dijkstra finds the shortest path; describeRoute turns the
// node path into step-by-step walking directions.

import { FLOORS, LANDMARKS, PARKING_LEVELS, PARKING_NODES } from '../data/stores.js'

// Basements sit below Ground so floor-hop counts and up/down read correctly.
const FLOOR_ORDER = ['P3', 'P2', 'P1', 'G', 'UG', 'F1', 'F2', 'F3']
const LIFT_COST = 15 // metres-equivalent per parking-lift hop
const X_METERS = 2 // mall long axis ≈ 200 m over x 0..100
const Y_METERS = 0.4 // mall depth ≈ 40 m over y 0..100
const ESCALATOR_COST = 12 // metres-equivalent per floor hop
const NEIGHBOURS = 4

export const floorLabelOf = (floorId) =>
  FLOORS.find((f) => f.id === floorId)?.label ??
  PARKING_LEVELS.find((l) => l.id === floorId)?.label ??
  floorId
const floorIndex = (floorId) => FLOOR_ORDER.indexOf(floorId)

const nodeId = (floor, name) => `${floor}:${name}`

function metres(a, b) {
  const dx = (a.x - b.x) * X_METERS
  const dy = (a.y - b.y) * Y_METERS
  return Math.hypot(dx, dy)
}

function buildGraph() {
  const nodes = new Map()

  for (const floor of FLOORS) {
    for (const s of floor.stores) {
      nodes.set(nodeId(floor.id, s.name), {
        id: nodeId(floor.id, s.name),
        floor: floor.id,
        name: s.name,
        x: s.x,
        y: s.y,
        type: 'store',
        category: s.category,
      })
    }
  }
  for (const l of [...LANDMARKS, ...PARKING_NODES]) {
    nodes.set(nodeId(l.floor, l.name), {
      id: nodeId(l.floor, l.name),
      floor: l.floor,
      name: l.name,
      x: l.x,
      y: l.y,
      type: l.type,
    })
  }

  const edges = new Map([...nodes.keys()].map((id) => [id, new Map()]))
  const link = (a, b, w) => {
    edges.get(a.id).set(b.id, w)
    edges.get(b.id).set(a.id, w)
  }

  // same-floor: each node ↔ its nearest neighbours
  for (const floorId of FLOOR_ORDER) {
    const floorNodes = [...nodes.values()].filter((n) => n.floor === floorId)
    for (const n of floorNodes) {
      const nearest = floorNodes
        .filter((m) => m !== n)
        .sort((a, b) => metres(n, a) - metres(n, b))
        .slice(0, NEIGHBOURS)
      for (const m of nearest) link(n, m, metres(n, m))
    }
  }

  // escalators between adjacent floors at both atriums
  for (let i = 0; i < FLOOR_ORDER.length - 1; i++) {
    for (const atrium of ['Atrium 1', 'Atrium 2']) {
      const a = nodes.get(nodeId(FLOOR_ORDER[i], atrium))
      const b = nodes.get(nodeId(FLOOR_ORDER[i + 1], atrium))
      if (a && b) link(a, b, ESCALATOR_COST)
    }
  }

  // parking lift chain: G ↔ P1 ↔ P2 ↔ P3
  for (const [upper, lower] of [['G', 'P1'], ['P1', 'P2'], ['P2', 'P3']]) {
    const a = nodes.get(nodeId(upper, 'Parking Lift'))
    const b = nodes.get(nodeId(lower, 'Parking Lift'))
    if (a && b) link(a, b, LIFT_COST)
  }

  return { nodes, edges }
}

const GRAPH = buildGraph()

export function findStoreNode(query) {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const all = [...GRAPH.nodes.values()].filter((n) => n.type === 'store')
  return (
    all.find((n) => n.name.toLowerCase() === q) ??
    all.find((n) => n.name.toLowerCase().includes(q)) ??
    null
  )
}

export function getNode(floor, name) {
  return GRAPH.nodes.get(nodeId(floor, name)) ?? null
}

export function allStores() {
  return [...GRAPH.nodes.values()].filter((n) => n.type === 'store')
}

export function dijkstra(startId, endId) {
  const { nodes, edges } = GRAPH
  if (!nodes.has(startId) || !nodes.has(endId)) return null

  const dist = new Map([[startId, 0]])
  const prev = new Map()
  const visited = new Set()
  const queue = [startId]

  while (queue.length) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))
    const u = queue.shift()
    if (visited.has(u)) continue
    visited.add(u)
    if (u === endId) break

    for (const [v, w] of edges.get(u)) {
      if (visited.has(v)) continue
      const alt = dist.get(u) + w
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt)
        prev.set(v, u)
        queue.push(v)
      }
    }
  }

  if (!prev.has(endId) && startId !== endId) return null
  const path = []
  for (let at = endId; at !== undefined; at = prev.get(at)) path.unshift(nodes.get(at))
  return { path, metres: dist.get(endId) ?? 0 }
}

// Full single-source Dijkstra: distance map to every node.
export function distancesFrom(startId) {
  const { nodes, edges } = GRAPH
  if (!nodes.has(startId)) return new Map()
  const dist = new Map([[startId, 0]])
  const visited = new Set()
  const queue = [startId]
  while (queue.length) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))
    const u = queue.shift()
    if (visited.has(u)) continue
    visited.add(u)
    for (const [v, w] of edges.get(u)) {
      if (visited.has(v)) continue
      const alt = dist.get(u) + w
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt)
        queue.push(v)
      }
    }
  }
  return dist
}

// Fair meeting spot: cafes, the food court, and atriums are candidates;
// pick the one minimising the *slower* person's walk.
export function bestMeetingPoint(aId, bId) {
  const distA = distancesFrom(aId)
  const distB = distancesFrom(bId)
  const candidates = [...GRAPH.nodes.values()].filter(
    (n) => n.category === 'Cafe' || n.name === 'Food Court' || n.type === 'atrium'
  )
  let best = null
  for (const c of candidates) {
    const a = distA.get(c.id)
    const b = distB.get(c.id)
    if (a === undefined || b === undefined) continue
    const worst = Math.max(a, b)
    if (!best || worst < best.worst) best = { node: c, worst, a, b }
  }
  return best
}

export function describeRoute(startId, endId) {
  const result = dijkstra(startId, endId)
  if (!result) return null
  const { path } = result

  const steps = []
  // Keep a structured counterpart for every conversational direction. The
  // visual guide consumes this, so its active map segment can never drift
  // away from the text generated by the deterministic router.
  const guidance = []
  const addStep = (text, detail) => {
    steps.push(text)
    guidance.push({ ...detail, text, step: steps.length })
  }
  const start = path[0]
  const dest = path[path.length - 1]

  addStep(`Start at ${start.name}, ${floorLabelOf(start.floor)}.`, {
    kind: 'start',
    floor: start.floor,
    from: start.id,
    to: start.id,
  })

  let i = 0
  let walkMetres = 0
  let escalatorHops = 0

  while (i < path.length - 1) {
    const here = path[i]
    const next = path[i + 1]

    if (here.floor !== next.floor) {
      // ride consecutive atrium hops as one instruction
      let j = i + 1
      while (
        j < path.length - 1 &&
        path[j + 1].floor !== path[j].floor &&
        (path[j].type === 'atrium' || path[j].type === 'lift')
      ) j++
      const landing = path[j]
      const hops = Math.abs(floorIndex(landing.floor) - floorIndex(here.floor))
      const up = floorIndex(landing.floor) > floorIndex(here.floor)
      escalatorHops += hops
      addStep(
        `Take the ${here.type === 'lift' ? 'lift' : `escalator at ${here.name}`} ${up ? 'up' : 'down'}${
          hops > 1 ? ` ${hops} floors` : ''
        } to ${floorLabelOf(landing.floor)}.`,
        {
          kind: here.type === 'lift' ? 'lift' : 'escalator',
          floor: here.floor,
          toFloor: landing.floor,
          from: here.id,
          to: landing.id,
        }
      )
      i = j
      continue
    }

    // walk run along one floor
    let j = i
    while (j < path.length - 1 && path[j + 1].floor === here.floor) j++
    const end = path[j]
    const mids = path
      .slice(i + 1, j)
      .filter((n) => n.type === 'store')
      .slice(0, 2)
      .map((n) => n.name)
    for (let k = i; k < j; k++) walkMetres += metres(path[k], path[k + 1])
    const dx = end.x - here.x
    const dir = dx > 3 ? 'right' : dx < -3 ? 'left' : 'straight ahead'
    const isFinal = j === path.length - 1
    addStep(
      `Walk ${dir}${mids.length ? ` past ${mids.join(' and ')}` : ''} ${
        isFinal ? `— ${end.name} is just ahead.` : `to ${end.name}.`
      }`,
      {
        kind: 'walk',
        floor: here.floor,
        from: here.id,
        to: end.id,
      }
    )
    i = j
  }

  // arrival flourish: name the nearest same-floor store neighbour
  if (dest.type === 'store') {
    const neighbour = allStores()
      .filter((n) => n.floor === dest.floor && n.name !== dest.name)
      .sort((a, b) => metres(dest, a) - metres(dest, b))[0]
    if (neighbour) {
      addStep(`You'll find it right next to ${neighbour.name}.`, {
        kind: 'arrival',
        floor: dest.floor,
        from: dest.id,
        to: dest.id,
      })
    }
  }

  const minutes = Math.max(1, Math.round(walkMetres / 75 + escalatorHops * 0.5))
  // Keep the route geometry alongside the conversational summary. Visual
  // renderers can now use the exact same deterministic route as the chat.
  return { steps, guidance, minutes, metres: Math.round(result.metres), dest, path }
}
