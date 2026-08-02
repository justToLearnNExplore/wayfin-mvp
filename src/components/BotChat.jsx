import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FLOORS, LANDMARKS, PARKING_LEVELS, PARKING_NODES } from '../data/stores.js'
import { allStores, bestMeetingPoint, describeRoute, findStoreNode, floorLabelOf } from '../lib/routing.js'
import { findProductById } from '../data/products.js'
import { parseIntent } from '../services/intentParser.js'
import { matchProductImage } from '../services/productMatcher.js'
import { trackEvent } from '../lib/analytics.js'
import { rankCandidates } from '../services/localization/candidates.js'
import { emptySlots, fillSlots, isActionable, acknowledge, phraseTarget } from '../services/navigation/slots.js'
import { resolveLocationText } from '../services/localization/textResolver.js'
import Scanner from './Scanner.jsx'
import WaitlistSheet, { JOINED_KEY } from './WaitlistSheet.jsx'
import LocationFinder from './LocationFinder.jsx'
import { SendIcon } from './icons.jsx'

const hasJoinedWaitlist = () => {
  try {
    return localStorage.getItem(JOINED_KEY) === '1'
  } catch {
    return false
  }
}

const ORIGINS = [
  { id: 'G:Mall Entry 1', label: 'Mall Entry 1 · G' },
  { id: 'G:Mall Entry 2', label: 'Mall Entry 2 · G' },
  { id: 'G:Mall Entry 3', label: 'Mall Entry 3 · G' },
  { id: 'F2:Food Court', label: 'Food Court · 2nd' },
  { id: 'G:Atrium 1', label: 'Atrium 1 · G' },
  { id: 'G:Atrium 2', label: 'Atrium 2 · G' },
]

const CATEGORIES = [...new Set(FLOORS.flatMap((f) => f.stores.map((s) => s.category)))]

// likely friend hangouts, one per level
const FRIEND_SPOTS = [
  { id: "G:LEVI'S", label: "LEVI'S · G" },
  { id: 'G:SEPHORA', label: 'SEPHORA · G' },
  { id: 'UG:STARBUCKS', label: 'STARBUCKS · UG' },
  { id: 'F1:MAX', label: 'MAX · 1st' },
  { id: 'F2:PVR', label: 'PVR · 2nd' },
  { id: 'F3:HAMLEYS', label: 'HAMLEYS · 3rd' },
]

const BIRTHDAY_DRESS_STORES = ['NEW ME', 'H&M', 'MANGO', 'ONLY', 'WESTSIDE']

const short = (floorId) => FLOORS.find((f) => f.id === floorId)?.short ?? floorId

let msgSeq = 0

const PARKING_KEY = 'wayfin_parking'
const getParking = () => {
  try {
    return JSON.parse(localStorage.getItem(PARKING_KEY) || 'null')
  } catch {
    return null
  }
}
const parkTime = (p) =>
  new Date(p.time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

// Resolve an LLM-returned name against the real catalogue (landmarks first,
// then stores). The parser's output is never trusted blindly — anything that
// doesn't resolve here is treated as low confidence.
const resolveNode = (name, parkingLevel = null) => {
  if (!name) return null
  const q = name.trim().toLowerCase()
  const level = PARKING_LEVELS.find((item) => item.id.toLowerCase() === parkingLevel?.trim().toLowerCase())?.id
  const parking = PARKING_NODES.find(
    (node) => node.name.toLowerCase() === q && (!level || node.floor === level)
  )
  if (parking) return { id: `${parking.floor}:${parking.name}`, name: parking.name, floor: parking.floor }
  const lm = LANDMARKS.find((l) => l.name.toLowerCase() === q)
  if (lm) return { id: `${lm.floor}:${lm.name}`, name: lm.name, floor: lm.floor }
  return findStoreNode(name)
}

// Local fuzzy candidates for the "did you mean…" fallback live in
// ../services/localization/candidates.js, with tests — the naive version here
// once offered MANYAVAR for "any gucci store".
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '')
const parkingOriginFromText = (text) => {
  const level = text.match(/\bP\s?([1-3])\b/i)?.[1]
  const zone = text.match(/\bzone\s*([A-D])\b/i)?.[1]?.toUpperCase()
  if (!level || !zone || !/\b(from|at|near|starting)\b/i.test(text)) return null
  return resolveNode(`Zone ${zone}`, `P${level}`)
}
const storeMentionedIn = (text) => {
  const query = norm(text)
  return allStores().find((node) => query.includes(norm(node.name))) ?? null
}
const suggestCandidates = (text) => rankCandidates(text, allStores())

export default function BotChat({ initialStore, lastVisited, onRouteReady, onOpenRoute, onAnchor, onEnter, onExpand }) {
  const [msgs, setMsgs] = useState([])
  const [options, setOptions] = useState([])
  const [input, setInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [waitlisting, setWaitlisting] = useState(false)
  const [locating, setLocating] = useState(false)
  /** Which flow is waiting on the location answer. @type {{current: 'route'|'friend'|'car'}} */
  const locateModeRef = useRef(/** @type {'route'|'friend'|'car'} */ ('route'))
  const flow = useRef({ phase: 'idle', dest: null })
  /**
   * Where you are / where you're going. Survives across turns so the bot
   * never re-asks for something it was already told.
   */
  const slots = useRef(emptySlots())
  const scrollRef = useRef(null)

  const push = (from, text) =>
    setMsgs((m) => [...m, { id: ++msgSeq, from, text }])

  const botSay = (text, opts = [], delay = 380) => {
    setOptions([])
    setTimeout(() => {
      push('bot', text)
      setOptions(opts)
    }, delay)
  }

  // conversation entry point (guarded against StrictMode double-mount)
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (initialStore) {
      const node = findStoreNode(initialStore.name)
      flow.current = { phase: 'idle', dest: node }
      push(
        'bot',
        `${initialStore.name} — ${floorLabelOf(node?.floor)}${
          initialStore.discount ? ` · ${initialStore.discount}% off tonight` : ''
        }. Want the fastest route there?`
      )
      setOptions([{ id: 'route', label: `Route me to ${initialStore.name}` }, ...idleOptions(true)])
    } else {
      const p = getParking()
      push(
        'bot',
        p
          ? `Good evening ✨ Welcome back — your car is pinned at ${p.level} · Zone ${p.zone} (since ${parkTime(p)}). What's the mission?`
          : "Good evening ✨ You're at Orion Mall. What's the mission?"
      )
      setOptions(idleOptions())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, options])

  const idleOptions = (skipExplore = false) =>
    [
      onEnter && { id: 'enter', label: 'Enter the mall →' },
      !skipExplore && { id: 'explore', label: 'Explore the stores' },
      { id: 'friend', label: 'Locate your friend' },
      { id: 'scan', label: 'Check a price' },
      getParking()
        ? { id: 'car', label: "I'm leaving — where's my car? 🚗" }
        : { id: 'parking', label: 'Save my parking' },
      !hasJoinedWaitlist() && { id: 'waitlist', label: '✦ Join the waitlist' },
    ].filter(Boolean)

  /**
   * Ask where the user is.
   *
   * Previously a list of six origin chips; now it opens {@link LocationFinder}
   * so the answer can come from the camera, voice or free text. The chips
   * survive as the manual fallback inside that screen, so nothing is lost.
   *
   * @param {'route'|'friend'|'car'} [mode] Which flow consumes the answer.
   */
  const askOrigin = (mode = 'route') => {
    // If the intent parser already extracted the origin, skip asking entirely.
    if (mode === 'route' && flow.current.originPreset) {
      const preset = flow.current.originPreset
      flow.current.originPreset = null
      return giveRoute(preset)
    }
    flow.current.phase = 'askOrigin'
    locateModeRef.current = mode
    setLocating(true)
  }

  const giveRoute = (originId) => {
    const dest = flow.current.dest
    const route = describeRoute(originId, dest.id)
    if (!route) {
      botSay("Hmm, I couldn't chart that one. Try another starting point?", idleOptions())
      flow.current = { phase: 'idle', dest: null }
      return
    }
    trackEvent('route_started', { destination: dest.name, floor: dest.floor })
    onRouteReady?.(route)
    flow.current = { phase: 'idle', dest: null, route }
    // A complete conversational request should hand straight into guidance.
    // The chat remains mounted behind the route HUD and is available via Chat.
    onOpenRoute?.(route)
    botSay(
      route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\n~${route.minutes} min walk (${route.metres} m).`,
      [
        { id: 'visual-route', label: 'View map' },
        { id: 'explore', label: 'New route' },
        { id: 'minimize', label: 'Done — back to browsing' },
      ],
      600
    )
  }

  // Shared by the "I'm leaving" chip flow and the LLM parking intent:
  // route from wherever the user is, down the parking lift, to the exact
  // basement zone where the car is pinned.
  const giveCarRoute = (originId) => {
    const p = getParking()
    const route = p && describeRoute(originId, `${p.level}:Zone ${p.zone}`)
    if (!p || !route) return botSay("I couldn't chart that one — try another spot?", idleOptions())
    route.steps = [
      ...route.steps,
      `Your car is on the ${p.zone} pillars — parked ${parkTime(p)}. 🚗`,
    ]
    trackEvent('parking_recalled')
    onRouteReady?.(route)
    flow.current = { phase: 'idle', dest: null, route }
    onOpenRoute?.(route)
    botSay(
      `Your car: ${p.level} · Zone ${p.zone} (since ${parkTime(p)}).\n\n` +
        route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\n~${route.minutes} min to your car.`,
      [
        { id: 'visual-route', label: 'View map' },
        { id: 'pclear', label: 'Got it — clear the pin' },
        { id: 'minimize', label: 'Done' },
      ],
      600
    )
  }

  const choose = (opt) => {
    push('user', opt.label)

    if (opt.id === 'enter') return onEnter?.()

    if (opt.id === 'route') return askOrigin()

    if (opt.id === 'visual-route') {
      if (flow.current.route) onOpenRoute?.(flow.current.route)
      return
    }

    if (opt.id === 'explore') {
      flow.current.phase = 'askCategory'
      botSay(
        'What are you in the mood for?',
        CATEGORIES.map((c) => ({ id: `cat:${c}`, label: c }))
      )
      return
    }

    if (opt.id.startsWith('cat:')) {
      const cat = opt.id.slice(4)
      flow.current.phase = 'askStore'
      const stores = allStores().filter((n) => n.category === cat).slice(0, 8)
      botSay(
        `Here's where ${cat.toLowerCase()} lives in Orion:`,
        stores.map((n) => ({ id: `dest:${n.id}`, label: `${n.name} · ${short(n.floor)}` }))
      )
      return
    }

    if (opt.id.startsWith('dest:')) {
      const picked = [...allStores()].find((n) => n.id === opt.id.slice(5))
      flow.current.dest = picked
      // Keep the slots authoritative: a tap is just another way of answering,
      // so the bot must not re-ask for an origin it already holds.
      if (picked) slots.current = { ...slots.current, destination: picked }
      return askOrigin()
    }

    if (opt.id.startsWith('origin:')) {
      const from = opt.id.slice(7)
      const node = [...allStores()].find((n) => n.id === from)
      slots.current = { ...slots.current, origin: node ?? slots.current.origin }
      return giveRoute(from)
    }

    if (opt.id === 'minimize') {
      botSay('Happy hunting ✨ Tap me anytime.', idleOptions())
      return
    }

    // ---- find a friend ----
    if (opt.id === 'friend') {
      trackEvent('friend_locate_started')
      flow.current.phase = 'friendMe'
      botSay("Let's locate them 🤝 First — where are YOU right now?", [], 250)
      setTimeout(() => askOrigin('friend'), 500)
      return
    }

    if (opt.id.startsWith('fme:')) {
      flow.current.me = opt.id.slice(4)
      // friend's spot may already be known from the intent parser
      if (flow.current.them) {
        flow.current.phase = 'friendChoice'
        botSay('Got both of you pinned. How do you want to do this?', [
          { id: 'fgo', label: 'Route me to them' },
          { id: 'fmeet', label: 'Meet in the middle ☕' },
        ])
        return
      }
      flow.current.phase = 'friendThem'
      botSay(
        "And where's your friend hiding?",
        [
          ...FRIEND_SPOTS.map((s) => ({ id: `fthem:${s.id}`, label: s.label })),
          ...ORIGINS.filter((o) => o.id !== flow.current.me).map((o) => ({
            id: `fthem:${o.id}`,
            label: o.label,
          })),
        ]
      )
      return
    }

    if (opt.id.startsWith('fthem:')) {
      flow.current.them = opt.id.slice(6)
      flow.current.phase = 'friendChoice'
      botSay('Got both of you pinned. How do you want to do this?', [
        { id: 'fgo', label: 'Route me to them' },
        { id: 'fmeet', label: 'Meet in the middle ☕' },
      ])
      return
    }

    if (opt.id === 'fgo') {
      const route = describeRoute(flow.current.me, flow.current.them)
      if (!route) return botSay("I couldn't chart that path — try again?", idleOptions())
      trackEvent('friend_located', { mode: 'direct' })
      onRouteReady?.(route)
      flow.current = { phase: 'idle', dest: null, route }
      onOpenRoute?.(route)
      botSay(
        route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          `\n\n~${route.minutes} min and you're reunited.`,
        [
          { id: 'visual-route', label: 'View map' },
          { id: 'friend', label: 'Locate another friend' },
          { id: 'minimize', label: 'Done' },
        ],
        600
      )
      return
    }

    if (opt.id === 'fmeet') {
      const meet = bestMeetingPoint(flow.current.me, flow.current.them)
      if (!meet) return botSay("No good middle ground found — try routing to them instead.", idleOptions())
      const route = describeRoute(flow.current.me, meet.node.id)
      const friendMins = Math.max(1, Math.round(meet.b / 75))
      trackEvent('friend_located', { mode: 'meet_in_middle' })
      onRouteReady?.(route)
      flow.current = { phase: 'idle', dest: null, route }
      onOpenRoute?.(route)
      botSay(
        `Fairest spot: ${meet.node.name}, ${floorLabelOf(meet.node.floor)}.\n\n` +
          route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          `\n\nTell your friend — they're only ~${friendMins} min away from it.`,
        [
          { id: 'visual-route', label: 'View map' },
          { id: 'friend', label: 'Locate another friend' },
          { id: 'minimize', label: 'Done' },
        ],
        600
      )
      return
    }

    // ---- price scan ----
    if (opt.id === 'scan') {
      trackEvent('price_check_opened')
      botSay('For this MVP, scan the NEW ME Ribbed Square-Neck Bodysuit. I’ll return only NEW ME’s exact online price and sizes.', [], 250)
      setTimeout(() => setScanning(true), 550)
      return
    }

    // ---- waitlist ----
    if (opt.id === 'waitlist') {
      trackEvent('waitlist_opened')
      setWaitlisting(true)
      return
    }

    // ---- parking ----
    if (opt.id === 'parking') {
      flow.current.phase = 'parkLevel'
      botSay(
        'Smart move 🅿️ Which level did you park on?',
        ['P1', 'P2', 'P3'].map((l) => ({ id: `plevel:${l}`, label: l }))
      )
      return
    }

    if (opt.id.startsWith('plevel:')) {
      flow.current.parkLevel = opt.id.slice(7)
      botSay(
        'And which zone? (It’s painted on the pillars)',
        ['A', 'B', 'C', 'D'].map((z) => ({ id: `pzone:${z}`, label: `Zone ${z}` }))
      )
      return
    }

    if (opt.id.startsWith('pzone:')) {
      const p = { level: flow.current.parkLevel, zone: opt.id.slice(6), time: Date.now() }
      localStorage.setItem(PARKING_KEY, JSON.stringify(p))
      trackEvent('parking_saved', { level: p.level, zone: p.zone })
      botSay(
        `Pinned 📍 ${p.level} · Zone ${p.zone}, ${parkTime(p)}. I'll remember — when you're heading out, just tap “I'm leaving”.`,
        idleOptions()
      )
      return
    }

    if (opt.id === 'car') {
      const p = getParking()
      if (!p) return botSay("I don't have a spot saved yet.", idleOptions())
      flow.current.phase = 'carOrigin'
      botSay(
        `${p.level} · Zone ${p.zone}, parked at ${parkTime(p)}. Where are you right now? I'll walk you out.`,
        [],
        250
      )
      setTimeout(() => askOrigin('car'), 500)
      return
    }

    if (opt.id.startsWith('carfrom:')) return giveCarRoute(opt.id.slice(8))

    if (opt.id === 'pclear') {
      localStorage.removeItem(PARKING_KEY)
      botSay('Pin cleared. Drive safe ✨', idleOptions())
      return
    }
  }

  /**
   * Receive a confirmed position from {@link LocationFinder}.
   *
   * Rather than duplicating the routing logic, this synthesises exactly the
   * chip the user would have tapped and replays it through `choose`, so the
   * deterministic flows (route / friend / car) stay the single source of
   * truth. The anchor is also handed upward to drive live positioning.
   *
   * @param {import('../services/localization/tracker.js').Anchor & {nodeId: string}} anchor
   */
  const handleLocated = (anchor) => {
    setLocating(false)
    onAnchor?.(anchor)

    // Camera / voice / typed fixes fill the same origin slot as everything
    // else, so the three input methods stay interchangeable.
    if (locateModeRef.current === 'route' && anchor.nodeId) {
      slots.current = {
        ...slots.current,
        origin: { id: anchor.nodeId, name: anchor.label, floor: anchor.floor },
      }
    }

    const prefix =
      locateModeRef.current === 'friend' ? 'fme:' : locateModeRef.current === 'car' ? 'carfrom:' : 'origin:'
    choose({ id: `${prefix}${anchor.nodeId}`, label: `📍 ${anchor.label}` })
  }

  const handleProductMatch = async (image) => {
    const productId = await matchProductImage(image)
    return findProductById(productId)
  }

  // Feed a parsed intent into the EXISTING state machine — this only pre-fills
  // slots (dest / originPreset / them / parkLevel) and re-uses the same phases
  // and handlers the chips drive. Returns false if nothing usable was extracted.
  const applyIntent = (p) => {
    const origin = resolveNode(p.origin, p.parkingLevel)
    const dest = resolveNode(p.destination, p.parkingLevel)
    const friendAt = resolveNode(p.friendLocation, p.parkingLevel)

    // ---- slot filling ----------------------------------------------------
    // Runs BEFORE any intent-label branching, because the label is not a
    // reliable signal of whether we understood the message. A bare "I'm near
    // H&M" arrives as intent `unknown` with a perfectly good origin at 0.9;
    // the old code discarded it for the label and then offered H&M back as a
    // destination, routing the shopper to where they already stood.
    const merged = fillSlots(slots.current, p, resolveNode)
    slots.current = merged.slots

    // Nothing resolved and no actionable intent — only NOW is it fair to guess.
    if (!isActionable(p, merged.filled)) {
      const cands = suggestCandidates(p.destination || p.origin || p.friendLocation)
      if (cands.length) {
        botSay(
          "I'm not sure which place you mean. Did you mean:",
          cands.map((n) => ({ id: `dest:${n.id}`, label: `${n.name} · ${short(n.floor)}` }))
        )
        return true
      }
      return false
    }

    // A message that only told us where the user is: acknowledge it and ask
    // for the one thing still missing, rather than treating it as a dead end.
    if (merged.filled.includes('origin') && !merged.slots.destination) {
      flow.current.originPreset = merged.slots.origin.id
      flow.current.phase = 'askCategory'
      botSay(
        acknowledge(merged.slots, merged.filled),
        CATEGORIES.map((c) => ({ id: `cat:${c}`, label: c }))
      )
      return true
    }

    // Both slots known, from this message or an earlier one — route now and
    // never re-ask for what we were already told.
    if (merged.slots.origin && merged.slots.destination && p.intent !== 'friend') {
      flow.current.dest = merged.slots.destination
      botSay(acknowledge(merged.slots, merged.filled), [], 300)
      const from = merged.slots.origin.id
      setTimeout(() => giveRoute(from), 700)
      return true
    }

    switch (p.intent) {
      case 'navigate': {
        if (dest) {
          flow.current.dest = dest
          if (origin) flow.current.originPreset = origin.id
          botSay(`${dest.name} — ${floorLabelOf(dest.floor)}. Let's get you there.`, [], 300)
          setTimeout(askOrigin, 750)
          return true
        }
        if (origin) {
          flow.current.originPreset = origin.id
          flow.current.phase = 'askCategory'
          botSay(
            `Got it — you're near ${origin.name}. Where do you want to go?`,
            CATEGORIES.map((c) => ({ id: `cat:${c}`, label: c }))
          )
          return true
        }
        return false
      }
      case 'store_search': {
        const cat = CATEGORIES.find((c) => c.toLowerCase() === (p.category || '').toLowerCase())
        if (!cat) return false
        if (origin) flow.current.originPreset = origin.id
        flow.current.phase = 'askStore'
        const stores = allStores().filter((n) => n.category === cat).slice(0, 8)
        botSay(
          `Here's where ${cat.toLowerCase()} lives in Orion:`,
          stores.map((n) => ({ id: `dest:${n.id}`, label: `${n.name} · ${short(n.floor)}` }))
        )
        return true
      }
      case 'friend': {
        if (friendAt) flow.current.them = friendAt.id
        if (friendAt && origin) {
          flow.current.me = origin.id
          flow.current.phase = 'friendChoice'
          botSay(
            `Got it — you're near ${origin.name}, they're at ${friendAt.name}. How do you want to do this?`,
            [
              { id: 'fgo', label: 'Route me to them' },
              { id: 'fmeet', label: 'Meet in the middle ☕' },
            ]
          )
          return true
        }
        flow.current.phase = 'friendMe'
        botSay(
          friendAt
            ? `Your friend's at ${friendAt.name} 🤝 Where are YOU right now?`
            : "Let's link you up 🤝 First — where are YOU right now?",
          ORIGINS.map((o) => ({ id: `fme:${o.id}`, label: o.label }))
        )
        return true
      }
      case 'parking': {
        const saved = getParking()
        if (saved && !p.parkingLevel) {
          // origin known from the intent parser → route to the exit directly
          if (origin) {
            giveCarRoute(origin.id)
            return true
          }
          flow.current.phase = 'carOrigin'
          botSay(
            `${saved.level} · Zone ${saved.zone}, parked at ${parkTime(saved)}. Where are you right now? I'll walk you out.`,
            ORIGINS.map((o) => ({ id: `carfrom:${o.id}`, label: o.label }))
          )
          return true
        }
        const lvl = ['P1', 'P2', 'P3'].find(
          (l) => l.toLowerCase() === (p.parkingLevel || '').toLowerCase()
        )
        if (lvl) {
          flow.current.parkLevel = lvl
          botSay(
            `Which zone on ${lvl}? (It’s painted on the pillars)`,
            ['A', 'B', 'C', 'D'].map((z) => ({ id: `pzone:${z}`, label: `Zone ${z}` }))
          )
        } else {
          flow.current.phase = 'parkLevel'
          botSay(
            'Smart move 🅿️ Which level did you park on?',
            ['P1', 'P2', 'P3'].map((l) => ({ id: `plevel:${l}`, label: l }))
          )
        }
        return true
      }
      case 'offers': {
        const deals = FLOORS.flatMap((f) =>
          f.stores
            .filter((s) => s.discount)
            .map((s) => ({ id: `dest:${f.id}:${s.name}`, label: `${s.name} −${s.discount}% · ${f.short}` }))
        )
        botSay("Tonight's live drops 🔥 — tap one and I'll route you there:", deals.slice(0, 8))
        return true
      }
      default:
        return false
    }
  }

  const submitText = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    push('user', text)
    setOptions([])

    // 1) LLM intent parser (server-side key, catalogue-validated output)
    const parsed = await parseIntent(text)
    if (parsed && applyIntent(parsed)) return

    // 2) offline / no-key fallback.
    //
    // This path must handle "I'm near H&M" too. The LLM is not always
    // reachable — no key, no signal, mall wifi — and a shopper telling the app
    // where they are should not depend on a network round trip. The phrasing
    // itself says which slot is meant, and resolveLocationText already turns
    // the sentence into a catalogue landmark (built in Chunk C, previously
    // wired only to the voice screen).
    const target = phraseTarget(text)
    if (target === 'origin') {
      const resolved = resolveLocationText(text)
      if (resolved.status === 'match' && resolved.matches?.length) {
        const place = resolveNode(resolved.entry?.name) ?? {
          id: resolved.matches[0].nodeId,
          name: resolved.matches[0].name,
          floor: resolved.matches[0].floor,
        }
        slots.current = { ...slots.current, origin: place }

        // Already knew where they wanted to go — that is everything.
        if (slots.current.destination) {
          flow.current.dest = slots.current.destination
          botSay(acknowledge(slots.current, ['origin']), [], 300)
          setTimeout(() => giveRoute(place.id), 700)
          return
        }
        flow.current.originPreset = place.id
        flow.current.phase = 'askCategory'
        botSay(
          acknowledge(slots.current, ['origin']),
          CATEGORIES.map((c) => ({ id: `cat:${c}`, label: c }))
        )
        return
      }
    }

    const parkingOrigin = parkingOriginFromText(text)
    const mentionedDestination = storeMentionedIn(text)
    if (parkingOrigin && mentionedDestination) {
      flow.current.dest = mentionedDestination
      flow.current.originPreset = parkingOrigin.id
      botSay(`${mentionedDestination.name} — ${floorLabelOf(mentionedDestination.floor)}. Let's get you there.`, [], 350)
      setTimeout(askOrigin, 800)
      return
    }
    if (/birthday|party/.test(text.toLowerCase()) && /dress|outfit|clothes|fashion/.test(text.toLowerCase())) {
      const picks = BIRTHDAY_DRESS_STORES.map((name) => findStoreNode(name)).filter(Boolean)
      botSay(
        'I found a birthday-dress shortlist. Pick a store and I’ll route you there:',
        picks.map((store) => ({ id: `dest:${store.id}`, label: `${store.name} · ${short(store.floor)}` })),
        350
      )
      return
    }
    // Destination, offline. Three passes, widening: the whole string as a
    // name, then a store named anywhere inside the sentence, then the NL
    // resolver. "take me to puma" fails the first and succeeds on the second —
    // matching only the whole string is why a plain sentence used to fall
    // through to "did you mean" for a store it had clearly understood.
    const node =
      findStoreNode(text) ??
      storeMentionedIn(text) ??
      (() => {
        const r = resolveLocationText(text)
        return r.status === 'match' && r.matches?.length
          ? { id: r.matches[0].nodeId, name: r.matches[0].name, floor: r.matches[0].floor }
          : null
      })()

    if (node) {
      flow.current.dest = node
      slots.current = { ...slots.current, destination: node }

      // Already know where they are — route instead of asking again.
      if (slots.current.origin) {
        botSay(acknowledge(slots.current, ['destination']), [], 300)
        const from = slots.current.origin.id
        setTimeout(() => giveRoute(from), 700)
        return
      }
      botSay(`${node.name} — ${floorLabelOf(node.floor)}. Let's get you there.`, [], 350)
      setTimeout(askOrigin, 800)
    } else {
      const cands = suggestCandidates(text)
      if (cands.length) {
        botSay(
          "I'm not sure which place you mean. Did you mean:",
          cands.map((n) => ({ id: `dest:${n.id}`, label: `${n.name} · ${short(n.floor)}` }))
        )
        return
      }
      botSay(
        "I didn't catch a place I know in that. Tap an option below, or try a store name like “Sephora”.",
        idleOptions()
      )
    }
  }

  useEffect(() => {
    if (msgs.length > 1) onExpand?.()
  }, [msgs.length, onExpand])

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1" style={{ overscrollBehavior: 'contain' }}>
        {msgs.map((m) =>
          m.from === 'bot' ? (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[92%] whitespace-pre-line rounded-[4px_18px_18px_18px] border border-ivory/10 bg-ivory/5 px-4 py-3 text-[13.5px] leading-relaxed text-ivory/90"
            >
              {m.text}
            </motion.div>
          ) : (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="ml-auto max-w-[85%] rounded-[18px_4px_18px_18px] border border-champagne/40 bg-champagne/15 px-4 py-2.5 text-[13px] font-semibold text-champagne-soft"
            >
              {m.text}
            </motion.div>
          )
        )}
        {options.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 pt-1"
          >
            {options.map((opt) =>
              opt.href ? (
                <a
                  key={opt.id}
                  href={opt.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-magenta/50 bg-magenta/10 px-3.5 py-2 text-[12px] font-semibold text-ivory active:bg-magenta/25 transition-colors cursor-pointer"
                >
                  {opt.label}
                </a>
              ) : (
                <button
                  key={opt.id}
                  onClick={() => choose(opt)}
                  className="rounded-full border border-champagne/45 bg-champagne/8 px-3.5 py-2 text-[12px] font-semibold text-ivory active:bg-champagne/25 transition-colors cursor-pointer"
                >
                  {opt.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </div>

      <form
        onSubmit={submitText}
        className="mt-2 flex items-center gap-2.5 rounded-2xl border border-ivory/15 px-4 py-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask wayFin anything…"
          className="w-full bg-transparent text-[16px] text-ivory placeholder:text-ivory/40 outline-none"
        />
        <button type="submit" aria-label="Send" className="cursor-pointer">
          <SendIcon />
        </button>
      </form>

      {scanning && <Scanner onMatch={handleProductMatch} onClose={() => setScanning(false)} />}
      {waitlisting && <WaitlistSheet onClose={() => setWaitlisting(false)} />}
      {locating && (
        <LocationFinder
          destinationName={locateModeRef.current === 'route' ? flow.current.dest?.name : undefined}
          onLocated={handleLocated}
          onCancel={() => {
            setLocating(false)
            botSay('No problem — tap a chip below whenever you’re ready.', idleOptions())
          }}
        />
      )}
    </>
  )
}
