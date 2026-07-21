import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { FLOORS, LANDMARKS, PARKING_LEVELS, PARKING_NODES } from '../data/stores.js'
import { floorLabelOf } from '../lib/routing.js'

// ---------- premium 3D mall world (After Dark) ----------
// A tilted extruded-block mall rendered in CSS 3D. The camera follows the
// active guidance step, the phone's gyroscope adds parallax, and the bottom
// sheet mirrors the deterministic narrator one step at a time.

const PLANE_W = 380
const PLANE_H = 560
const pt = (node) => ({ x: 26 + node.x * 3.28, y: 30 + node.y * 5.0 })

const FLOOR_RAIL = ['F3', 'F2', 'F1', 'UG', 'G', 'P1', 'P2', 'P3']

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

// angular top-face silhouettes, GTA-map style
const CUTS = [
  'polygon(14px 0, 100% 0, 100% 100%, 0 100%, 0 14px)',
  'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)',
  'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
  'polygon(0 0, 100% 0, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
]

const floorNodes = (floorId) => [
  ...(FLOORS.find((f) => f.id === floorId)?.stores ?? []).map((s) => ({ ...s, type: 'store' })),
  ...LANDMARKS.filter((l) => l.floor === floorId),
  ...PARKING_NODES.filter((n) => n.floor === floorId),
]

const floorIndexOf = (id) => FLOOR_RAIL.indexOf(id)

function Block({ node, labelled, state = 'default', onSelect }) {
  const h = hash(node.name)
  const isAtrium = node.type === 'atrium'
  const isZone = node.type === 'zone'
  const isCurrent = state === 'current'
  const isNext = state === 'next'
  const isDestination = state === 'destination'
  const isSelected = state === 'selected'
  const w = isAtrium ? 66 : isZone ? 96 : 58 + (h % 5) * 12
  const d = isAtrium ? 66 : isZone ? 78 : 42 + ((h >> 3) % 4) * 11
  const z = isAtrium ? 24 : 12 + ((h >> 5) % 3) * 5
  const clip = isAtrium
    ? 'polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)'
    : CUTS[(h >> 7) % 4]
  const p = pt(node)
  const Wrapper = onSelect ? 'button' : 'div'
  return (
    <Wrapper
      {...(onSelect ? { type: 'button', onClick: onSelect, 'aria-label': `Inspect ${node.name}` } : {})}
      className={`absolute ${onSelect ? 'cursor-pointer border-0 bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/80' : ''}`}
      style={{
        left: p.x - w / 2,
        top: p.y - d / 2,
        width: w,
        height: d,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* plinth / side illusion */}
      <div
        className="absolute"
        style={{
          inset: -2,
          clipPath: clip,
          background: '#07060a',
          boxShadow: '0 10px 24px rgba(0,0,0,.65)',
        }}
      />
      {/* top face */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translateZ(${z}px)`,
          clipPath: clip,
          background: isSelected
            ? 'linear-gradient(145deg,#3b1c3b,#1b0d20)'
            : isCurrent
            ? 'linear-gradient(145deg,#15323a,#0d1b20)'
            : isNext || isDestination
              ? 'linear-gradient(145deg,#332917,#16100a)'
              : isAtrium
                ? 'linear-gradient(135deg,#1c1824,#100d16)'
                : 'linear-gradient(145deg,#17141d,#0e0c13)',
          border: `1px solid ${isSelected ? 'rgba(232,74,138,.9)' : isCurrent ? 'rgba(56,199,216,.85)' : isNext || isDestination ? 'rgba(216,182,92,.9)' : 'rgba(201,162,39,.30)'}`,
          boxShadow: isSelected
            ? '0 0 20px rgba(232,74,138,.28)'
            : isCurrent
            ? '0 0 20px rgba(56,199,216,.25)'
            : isNext || isDestination
              ? '0 0 18px rgba(216,182,92,.18)'
              : undefined,
        }}
      >
        {labelled && (
          <span
            className="px-1 text-center font-bold text-ivory/70"
            style={{ fontSize: 8.5, letterSpacing: '.14em' }}
          >
            {node.name.toUpperCase()}
          </span>
        )}
      </div>
    </Wrapper>
  )
}

export default function RouteMap({ route, onClose }) {
  const guidance = route.guidance ?? []
  const [stepIdx, setStepIdx] = useState(0)
  const [selectedStore, setSelectedStore] = useState(null)
  const [confirmedLandmark, setConfirmedLandmark] = useState(null)
  const g = guidance[Math.min(stepIdx, guidance.length - 1)] ?? {}
  const anchor = route.path.find((n) => n.id === g.to) ?? route.dest
  const floorId = g.kind === 'escalator' || g.kind === 'lift' ? g.toFloor : g.floor ?? anchor.floor
  const activeNode = route.path.find((n) => n.id === g.from) ?? route.path[0]
  const activePathIndex = route.path.findIndex((n) => n.id === activeNode.id)
  const nextNode = route.path.slice(activePathIndex + 1).find((n) => n.floor === floorId) ?? null
  const positionNode = activeNode.floor === floorId ? activeNode : anchor
  const manualPosition = confirmedLandmark?.floor === floorId ? confirmedLandmark : null
  const currentPosition = manualPosition ?? positionNode
  const prevFloor = useRef(floorId)
  const dir = floorIndexOf(floorId) <= floorIndexOf(prevFloor.current) ? 1 : -1
  useEffect(() => { prevFloor.current = floorId }, [floorId])

  const routeFloors = [...new Set(route.path.map((n) => n.floor))]
  const floorPath = useMemo(() => route.path.filter((n) => n.floor === floorId), [route.path, floorId])
  const points = floorPath.map(pt)
  const pathD = points.length > 1 ? `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}` : ''

  // Route stops, structural points, and a compact nearby set remain legible on mobile.
  const onRoute = new Set(route.path.map((n) => n.name))
  const nearbyStoreNames = new Set(
    floorNodes(floorId)
      .filter((n) => n.type === 'store')
      .sort((a, b) => Math.hypot(a.x - currentPosition.x, a.y - currentPosition.y) - Math.hypot(b.x - currentPosition.x, b.y - currentPosition.y))
      .slice(0, 4)
      .map((n) => n.name)
  )
  const labelled = (n) => onRoute.has(n.name) || nearbyStoreNames.has(n.name) || n.type !== 'store'
  const blockState = (n) => {
    if (n.name === selectedStore?.name && selectedStore.floor === floorId) return 'selected'
    if (n.name === currentPosition.name) return 'current'
    if (n.name === route.dest.name && route.dest.floor === floorId) return 'destination'
    if (n.name === nextNode?.name) return 'next'
    return 'default'
  }

  // Camera pan follows the user and the next visible store, not the final
  // destination. That keeps the GTA-style context above the route sheet.
  const focusNode = nextNode ?? currentPosition
  const currentPoint = pt(currentPosition)
  const focusPoint = pt(focusNode)
  const ap = {
    x: (currentPoint.x + focusPoint.x) / 2,
    y: (currentPoint.y + focusPoint.y) / 2,
  }
  const panX = 190 - ap.x
  const panY = 320 - ap.y

  // gyro parallax + drag peek
  const rz = useMotionValue(0)
  const rx = useMotionValue(0)
  const srz = useSpring(rz, { stiffness: 60, damping: 14 })
  const srx = useSpring(rx, { stiffness: 60, damping: 14 })
  const mapX = useMotionValue(0)
  const mapY = useMotionValue(0)
  const dragRef = useRef(null)
  useEffect(() => {
    const onOrient = (e) => {
      if (e.gamma == null) return
      rz.set(Math.max(-6, Math.min(6, e.gamma / 7)))
      rx.set(Math.max(-4, Math.min(4, (e.beta - 40) / 12)))
    }
    window.addEventListener('deviceorientation', onOrient)
    // iOS needs a user-gesture permission request
    const askIOS = () => {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
        DeviceOrientationEvent.requestPermission().catch(() => {})
      window.removeEventListener('pointerdown', askIOS)
    }
    window.addEventListener('pointerdown', askIOS, { once: true })
    return () => {
      window.removeEventListener('deviceorientation', onOrient)
      window.removeEventListener('pointerdown', askIOS)
    }
  }, [rz, rx])

  const destOnFloor = route.dest.floor === floorId

  // outgoing bearing at the anchor, for the turn arrow
  const turnAngle = useMemo(() => {
    const i = route.path.findIndex((n) => n.id === anchor.id)
    const next = route.path.slice(i + 1).find((n) => n.floor === anchor.floor)
    if (!next) return null
    const a = pt(anchor)
    const b = pt(next)
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90
  }, [route.path, anchor])

  const last = stepIdx >= guidance.length - 1

  const stepIcon = () => {
    const t = (g.text || '').toLowerCase()
    if (g.kind === 'lift' || g.kind === 'escalator')
      return <path d="M12 3v18M6 9l6-6 6 6M6 15l6 6 6-6" />
    if (g.kind === 'arrival') return <path d="M12 2l2.5 7h7L16 13.5 18 21l-6-4.5L6 21l2-7.5L2.5 9h7z" />
    if (t.includes('left')) return <path d="M20 18v-6a4 4 0 0 0-4-4H4M9 3L4 8l5 5" />
    if (t.includes('right')) return <path d="M4 18v-6a4 4 0 0 1 4-4h12M15 3l5 5-5 5" />
    return <path d="M12 20V4M6 10l6-6 6 6" />
  }

  const jumpToFloor = (fid) => {
    const idx = guidance.findIndex(
      (s) => (s.kind === 'escalator' || s.kind === 'lift' ? s.toFloor : s.floor) === fid
    )
    if (idx >= 0) setStepIdx(idx)
  }

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      aria-label={`Visual route to ${route.dest.name}`}
      className="route-map absolute inset-0 z-50 flex flex-col overflow-hidden bg-obsidian text-ivory"
    >
      {/* header */}
      <header className="route-map-header relative z-20 shrink-0 pt-7 text-center">
        <h2 className="font-display text-[30px] leading-none">
          way<em className="italic text-champagne-soft">Fin</em>
        </h2>
        <p className="mt-1 text-[9.5px] font-semibold tracking-[0.32em] text-ivory/55">
          ORION MALL · BRIGADE GATEWAY
        </p>
        <button
          onClick={onClose}
          aria-label="Back to chat"
          className="absolute right-4 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-ivory/15 text-ivory/60 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* 3D viewport */}
      <div className="route-map-canvas relative z-10 min-h-0 flex-1" style={{ perspective: 950, touchAction: 'none' }}>
        <motion.div
          className="absolute inset-0"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, sx: mapX.get(), sy: mapY.get() }
          }}
          onPointerMove={(event) => {
            const start = dragRef.current
            if (!start || start.id !== event.pointerId) return
            mapX.set(Math.max(-130, Math.min(130, start.sx + event.clientX - start.x)))
            mapY.set(Math.max(-190, Math.min(190, start.sy + event.clientY - start.y)))
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.id === event.pointerId) dragRef.current = null
          }}
          onPointerCancel={() => { dragRef.current = null }}
          style={{ x: mapX, y: mapY, transformStyle: 'preserve-3d', cursor: 'grab', touchAction: 'none' }}
        >
          <motion.div className="absolute left-1/2 top-1/2 h-0 w-0" style={{ rotateX: srx, rotateZ: srz, transformStyle: 'preserve-3d' }}>
            <motion.div
              className="absolute"
              style={{
                width: PLANE_W,
                height: PLANE_H,
                transform: 'rotateX(52deg) rotateZ(-10deg)',
                transformStyle: 'preserve-3d',
              }}
            >
            <AnimatePresence mode="popLayout" custom={dir}>
              <motion.div
                key={floorId}
                initial={{ opacity: 0, z: dir * -60 }}
                animate={{ opacity: 1, z: 0, x: panX - PLANE_W / 2, y: panY - PLANE_H / 2 }}
                exit={{ opacity: 0, z: dir * 60 }}
                transition={{ duration: 0.6, ease: [0.25, 0.9, 0.3, 1] }}
                className="absolute inset-0"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* floor plate */}
                <div
                  className="absolute rounded-[40px]"
                  style={{
                    inset: -48,
                    background:
                      'radial-gradient(80% 70% at 50% 42%, #14111a 0%, #0B0A0F 78%)',
                    border: '1px solid rgba(201,162,39,.16)',
                    backgroundImage:
                      'repeating-linear-gradient(90deg, rgba(201,162,39,.05) 0 1px, transparent 1px 46px), repeating-linear-gradient(0deg, rgba(201,162,39,.05) 0 1px, transparent 1px 46px)',
                  }}
                />

                {floorNodes(floorId).map((node) => (
                  <Block
                    key={`${node.type}-${node.name}`}
                    node={node}
                    labelled={labelled(node) && !(destOnFloor && node.name === route.dest.name)}
                    state={blockState(node)}
                    onSelect={node.type === 'store' ? () => setSelectedStore({ ...node, floor: floorId }) : undefined}
                  />
                ))}

                {/* route */}
                <svg
                  viewBox={`0 0 ${PLANE_W} ${PLANE_H}`}
                  className="absolute inset-0 overflow-visible"
                  style={{ transform: 'translateZ(28px)', pointerEvents: 'none' }}
                >
                  {pathD && (
                    <>
                      <path d={pathD} fill="none" stroke="#C9A227" strokeWidth="9" strokeOpacity=".14" strokeLinecap="round" />
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#E8C96A"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="7 9"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(216,182,92,.9))', animation: 'routeflow 1.2s linear infinite' }}
                      />
                    </>
                  )}
                  {currentPosition.floor === floorId && (
                    <g transform={`translate(${pt(currentPosition).x} ${pt(currentPosition).y})`}>
                      <circle r="16" fill="#38C7D8" fillOpacity=".12">
                        <animate attributeName="r" values="10;20;10" dur="2.4s" repeatCount="indefinite" />
                      </circle>
                      <circle r="7" fill="#38C7D8" />
                      <text y="-22" textAnchor="middle" fill="#8BE8F0" fontSize="10" fontWeight="800" letterSpacing="1.5">YOU</text>
                    </g>
                  )}
                  {destOnFloor && (
                    <g transform={`translate(${pt(route.dest).x} ${pt(route.dest).y})`}>
                      <circle r="17" fill="none" stroke="#D8B65C" strokeOpacity=".55">
                        <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <circle r="9" fill="none" stroke="#D8B65C" strokeWidth="1.5" />
                      <circle r="4.5" fill="#F4E3AE" />
                      <text y="-24" textAnchor="middle" fill="#F5EFE4" fontSize="11" fontWeight="800" letterSpacing="1.5">
                        {route.dest.name}
                      </text>
                    </g>
                  )}
                  {turnAngle != null && !last && (
                    <g transform={`translate(${ap.x} ${ap.y}) rotate(${turnAngle})`}>
                      <polygon points="0,-16 11,6 0,0 -11,6" fill="#F2C14E" style={{ filter: 'drop-shadow(0 0 8px rgba(242,193,78,.9))' }} />
                    </g>
                  )}
                </svg>
              </motion.div>
            </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>

        <div className="pointer-events-none absolute left-4 top-3 z-20 max-w-[155px] rounded-xl border border-ivory/15 bg-obsidian/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
          <p className="text-[9px] font-bold tracking-[0.2em] text-cyan">{manualPosition ? 'LANDMARK SET' : 'YOU ARE HERE'}</p>
          <p className="mt-0.5 truncate text-[12px] font-bold text-ivory">{currentPosition.name}</p>
          {nextNode && <p className="mt-1 text-[10px] text-ivory/55">Next · <span className="font-semibold text-champagne-soft">{nextNode.name}</span></p>}
        </div>

        {selectedStore?.floor === floorId && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-4 top-[92px] z-30 w-[180px] rounded-xl border border-champagne/40 bg-obsidian-2/95 p-3 shadow-2xl backdrop-blur-xl"
          >
            <p className="text-[9px] font-bold tracking-[0.18em] text-champagne-soft">STORE SELECTED</p>
            <p className="mt-1 font-display text-[18px] leading-tight text-ivory">{selectedStore.name}</p>
            <p className="mt-1 text-[10px] leading-snug text-ivory/55">Use this only after you can see the store sign.</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setConfirmedLandmark(selectedStore); setSelectedStore(null) }}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-cyan/50 bg-cyan/10 px-2 text-[10px] font-extrabold text-cyan cursor-pointer active:bg-cyan/20"
              >
                Set landmark
              </button>
              <button
                onClick={() => setSelectedStore(null)}
                aria-label="Close selected store"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-ivory/15 text-ivory/65 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </motion.div>
        )}

        {/* floor rail */}
        <div className="route-map-floor-strip absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
          {FLOOR_RAIL.filter((id) => !id.startsWith('P') || routeFloors.includes(id)).map((id) => {
            const meta =
              FLOORS.find((f) => f.id === id) ?? PARKING_LEVELS.find((l) => l.id === id)
            const active = id === floorId
            const on = routeFloors.includes(id)
            return (
              <button
                key={id}
                onClick={() => on && jumpToFloor(id)}
                disabled={!on}
                aria-current={active ? 'true' : undefined}
                aria-label={floorLabelOf(id)}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                  active
                    ? 'border-champagne bg-champagne/20 text-champagne-soft cursor-pointer'
                    : on
                      ? 'border-ivory/25 text-ivory/70 cursor-pointer'
                      : 'border-ivory/10 text-ivory/25 cursor-not-allowed'
                }`}
              >
                {meta?.short ?? id}
              </button>
            )
          })}
        </div>
      </div>

      {/* bottom sheet */}
      <motion.div
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.34, ease: 'easeOut' }}
        className="route-map-sheet relative z-20 mx-3 mb-3 mt-2 shrink-0 rounded-[26px] border border-champagne/35 bg-obsidian-2/95 p-5 backdrop-blur-xl"
      >
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-champagne/50" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[32px] leading-none text-champagne-soft">{route.dest.name}</h3>
            <p className="mt-1.5 text-[13.5px] text-ivory/75">
              <span className="font-bold text-champagne-soft">{route.metres} m</span> · about {route.minutes} min
            </p>
          </div>
          <div
            className="mt-1 h-9 w-9 shrink-0"
            style={{
              background: 'conic-gradient(from 210deg,#7C5CFF,#E84A8A,#F2A03D,#38C7D8,#7C5CFF)',
              clipPath: 'polygon(50% 0,100% 28%,88% 100%,12% 100%,0 28%)',
              borderRadius: 10,
              opacity: 0.9,
            }}
          />
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-ivory/10 pt-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D8B65C" strokeWidth="2" className="shrink-0" aria-hidden="true">
            {stepIcon()}
          </svg>
          <p className="font-display flex-1 text-[16.5px] leading-snug text-ivory/90">{g.text}</p>
          <button
            onClick={() => {
              setConfirmedLandmark(null)
              setSelectedStore(null)
              last ? onClose() : setStepIdx((i) => i + 1)
            }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-champagne/60 bg-champagne/10 px-4 text-[12.5px] font-extrabold tracking-wide text-champagne-soft cursor-pointer active:bg-champagne/25"
          >
            {last ? 'DONE' : 'NEXT'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

      </motion.div>

      <style>{`@keyframes routeflow { to { stroke-dashoffset: -16; } }`}</style>
    </motion.section>
  )
}
