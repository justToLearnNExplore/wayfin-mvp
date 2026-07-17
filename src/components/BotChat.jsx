import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FLOORS } from '../data/stores.js'
import { allStores, bestMeetingPoint, describeRoute, findStoreNode, floorLabelOf } from '../lib/routing.js'
import { findProduct } from '../data/products.js'
import Scanner from './Scanner.jsx'
import { SendIcon } from './icons.jsx'

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

export default function BotChat({ initialStore, lastVisited, onRouted, onEnter, onExpand }) {
  const [msgs, setMsgs] = useState([])
  const [options, setOptions] = useState([])
  const [input, setInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const flow = useRef({ phase: 'idle', dest: null })
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
      { id: 'friend', label: 'Find a friend' },
      { id: 'scan', label: 'Check a price' },
      getParking()
        ? { id: 'car', label: "I'm leaving — where's my car? 🚗" }
        : { id: 'parking', label: 'Save my parking' },
    ].filter(Boolean)

  const askOrigin = () => {
    flow.current.phase = 'askOrigin'
    const opts = [...ORIGINS.map((o) => ({ id: `origin:${o.id}`, label: o.label }))]
    if (lastVisited && lastVisited !== flow.current.dest?.id) {
      opts.unshift({
        id: `origin:${lastVisited}`,
        label: `Just came from ${lastVisited.split(':')[1]}`,
      })
    }
    botSay('Where are you right now?', opts)
  }

  const giveRoute = (originId) => {
    const dest = flow.current.dest
    const route = describeRoute(originId, dest.id)
    if (!route) {
      botSay("Hmm, I couldn't chart that one. Try another starting point?", idleOptions())
      flow.current = { phase: 'idle', dest: null }
      return
    }
    botSay(
      route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\n~${route.minutes} min walk (${route.metres} m).`,
      [
        { id: 'explore', label: 'New route' },
        { id: 'minimize', label: 'Done — back to browsing' },
      ],
      600
    )
    onRouted?.(dest.id)
    flow.current = { phase: 'idle', dest: null }
  }

  const choose = (opt) => {
    push('user', opt.label)

    if (opt.id === 'enter') return onEnter?.()

    if (opt.id === 'route') return askOrigin()

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
      flow.current.dest = [...allStores()].find((n) => n.id === opt.id.slice(5))
      return askOrigin()
    }

    if (opt.id.startsWith('origin:')) return giveRoute(opt.id.slice(7))

    if (opt.id === 'minimize') {
      botSay('Happy hunting ✨ Tap me anytime.', idleOptions())
      return
    }

    // ---- find a friend ----
    if (opt.id === 'friend') {
      flow.current.phase = 'friendMe'
      botSay(
        "Let's link you up 🤝 First — where are YOU right now?",
        ORIGINS.map((o) => ({ id: `fme:${o.id}`, label: o.label }))
      )
      return
    }

    if (opt.id.startsWith('fme:')) {
      flow.current.me = opt.id.slice(4)
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
      botSay(
        route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          `\n\n~${route.minutes} min and you're reunited.`,
        [
          { id: 'friend', label: 'Find another friend' },
          { id: 'minimize', label: 'Done' },
        ],
        600
      )
      flow.current = { phase: 'idle', dest: null }
      return
    }

    if (opt.id === 'fmeet') {
      const meet = bestMeetingPoint(flow.current.me, flow.current.them)
      if (!meet) return botSay("No good middle ground found — try routing to them instead.", idleOptions())
      const route = describeRoute(flow.current.me, meet.node.id)
      const friendMins = Math.max(1, Math.round(meet.b / 75))
      botSay(
        `Fairest spot: ${meet.node.name}, ${floorLabelOf(meet.node.floor)}.\n\n` +
          route.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
          `\n\nTell your friend — they're only ~${friendMins} min away from it.`,
        [
          { id: 'friend', label: 'Find another friend' },
          { id: 'minimize', label: 'Done' },
        ],
        600
      )
      flow.current = { phase: 'idle', dest: null }
      return
    }

    // ---- price scan ----
    if (opt.id === 'scan') {
      botSay('Point your camera at the barcode on the tag 📷', [], 250)
      setTimeout(() => setScanning(true), 550)
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
      botSay(
        `Pinned 📍 ${p.level} · Zone ${p.zone}, ${parkTime(p)}. I'll remember — when you're heading out, just tap “I'm leaving”.`,
        idleOptions()
      )
      return
    }

    if (opt.id === 'car') {
      const p = getParking()
      if (!p) return botSay("I don't have a spot saved yet.", idleOptions())
      botSay(
        `Your car is at ${p.level} · Zone ${p.zone} — parked at ${parkTime(p)}.\n\n1. Take any escalator down to Ground Floor.\n2. Exit via Mall Entry 2.\n3. Follow the ${p.level} ramp signs — Zone ${p.zone} is marked on the pillars. 🚗`,
        [
          { id: 'pclear', label: 'Got it — clear the pin' },
          { id: 'minimize', label: 'Done' },
        ],
        500
      )
      return
    }

    if (opt.id === 'pclear') {
      localStorage.removeItem(PARKING_KEY)
      botSay('Pin cleared. Drive safe ✨', idleOptions())
      return
    }
  }

  const handleScan = (code) => {
    setScanning(false)
    const p = findProduct(code)
    const fmt = (n) => `₹${n.toLocaleString('en-IN')}`
    if (!p) {
      botSay(
        `Hmm, barcode ${code} isn't in my demo catalogue yet. Try a demo product?`,
        [{ id: 'scan', label: 'Scan again' }, ...idleOptions(true)]
      )
      return
    }
    const diff = p.storePrice - p.onlinePrice
    const header = `${p.name} — ${p.brand}, size ${p.size}\nIn-store: ${fmt(p.storePrice)} · Online: ${fmt(p.onlinePrice)}`
    const verdict =
      diff > 0
        ? `\n\n💸 It's ${fmt(diff)} cheaper on ${p.brand}'s own site right now.`
        : `\n\n✅ The rack price beats online — grab it here. Other sizes online: ${p.otherSizes.join(', ')}.`
    botSay(header + verdict, [
      { id: 'link', label: `Open ${p.brand} online ↗`, href: p.url },
      { id: 'scan', label: 'Scan another' },
      { id: 'minimize', label: 'Done' },
    ], 400)
  }

  const submitText = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    push('user', text)
    const node = findStoreNode(text)
    if (node) {
      flow.current.dest = node
      botSay(`${node.name} — ${floorLabelOf(node.floor)}. Let's get you there.`, [], 350)
      setTimeout(askOrigin, 800)
    } else {
      botSay(
        "I'm running on pure mall-brain for now (no API key plugged in). Tap an option below, or type a store name like “Sephora”.",
        idleOptions()
      )
    }
  }

  useEffect(() => {
    if (msgs.length > 1) onExpand?.()
  }, [msgs.length, onExpand])

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto pr-1" style={{ overscrollBehavior: 'contain' }}>
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

      {scanning && <Scanner onResult={handleScan} onClose={() => setScanning(false)} />}
    </>
  )
}
