import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FLOORS, LANDMARKS, PARKING_LEVELS, PARKING_NODES } from '../data/stores.js'
import { floorLabelOf } from '../lib/routing.js'

const floorNodes = (floorId) => [
  ...(FLOORS.find((floor) => floor.id === floorId)?.stores ?? []).map((store) => ({ ...store, type: 'store' })),
  ...LANDMARKS.filter((landmark) => landmark.floor === floorId),
  ...PARKING_NODES.filter((node) => node.floor === floorId),
]

const point = (node) => ({ x: 28 + node.x * 2.84, y: 38 + node.y * 4.08 })
const isParkingFloor = (floorId) => PARKING_LEVELS.some((level) => level.id === floorId)

const guidanceIndexForFloor = (guidance, floorId, preferLast = false) => {
  const onFloor = guidance
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.floor === floorId)
  const walking = onFloor.filter(({ item }) => item.kind === 'walk')
  const candidates = walking.length ? walking : onFloor
  if (!candidates.length) return 0
  return preferLast ? candidates[candidates.length - 1].index : candidates[0].index
}

function RouteGlyph({ node, accent = '#D8B65C' }) {
  const { x, y } = point(node)
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="5" fill="#0B0A0F" stroke={accent} strokeWidth="1.6" />
      <circle r="1.8" fill={accent} />
    </g>
  )
}

export default function RouteMap({ route, onClose }) {
  const routeFloors = [...new Set(route.path.map((node) => node.floor))]
  const isParkingRoute = route.path.some((node) => isParkingFloor(node.floor))
  const guidance = route.guidance ?? []
  const initialFloor = isParkingFloor(route.dest.floor) ? route.dest.floor : route.path[0]?.floor ?? route.dest.floor
  const [floorId, setFloorId] = useState(initialFloor)
  const [guidanceIndex, setGuidanceIndex] = useState(() =>
    guidanceIndexForFloor(guidance, initialFloor, isParkingFloor(route.dest.floor))
  )
  const activeGuidance = guidance[guidanceIndex]
  const nextGuidance = guidance[guidanceIndex + 1]
  const visibleFloors = isParkingFloor(floorId) ? PARKING_LEVELS : FLOORS
  const floorPath = useMemo(() => {
    if (!activeGuidance?.from || !activeGuidance?.to) {
      return route.path.filter((node) => node.floor === floorId)
    }
    const from = route.path.findIndex((node) => node.id === activeGuidance.from)
    const to = route.path.findIndex((node) => node.id === activeGuidance.to)
    if (from < 0 || to < 0) return route.path.filter((node) => node.floor === floorId)
    return route.path.slice(Math.min(from, to), Math.max(from, to) + 1).filter((node) => node.floor === floorId)
  }, [activeGuidance, floorId, route.path])
  const points = floorPath.map(point)
  const pathD = points.length > 1 ? `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}` : ''
  const start = route.path[0]
  const isDestinationFloor = floorId === route.dest.floor
  const mapInstruction = activeGuidance?.text ?? route.steps.find((step) => step.includes(floorLabelOf(floorId))) ?? route.steps[1] ?? route.steps[0]
  const heading = points.length > 1
    ? points[points.length - 1].x > points[0].x + 3 ? 'HEADING RIGHT' : points[points.length - 1].x < points[0].x - 3 ? 'HEADING LEFT' : 'STRAIGHT AHEAD'
    : activeGuidance?.kind === 'lift' ? 'LIFT TRANSFER' : 'ROUTE LOCKED'

  const selectFloor = (nextFloor) => {
    setFloorId(nextFloor)
    setGuidanceIndex(guidanceIndexForFloor(guidance, nextFloor, nextFloor === route.dest.floor))
  }

  const advanceGuidance = () => {
    if (!nextGuidance) return
    setGuidanceIndex((index) => index + 1)
    if (nextGuidance.floor && nextGuidance.floor !== floorId) setFloorId(nextGuidance.floor)
  }

  const nextActionLabel = activeGuidance?.kind === 'lift' || activeGuidance?.kind === 'escalator'
    ? `Show ${floorLabelOf(activeGuidance.toFloor)}`
    : activeGuidance?.kind === 'walk'
      ? `At ${route.path.find((node) => node.id === activeGuidance.to)?.name ?? 'next point'}`
      : 'Next direction'

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      aria-label={`Visual route to ${route.dest.name}`}
      className="route-map absolute inset-0 z-50 flex flex-col overflow-hidden bg-obsidian text-ivory"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 48% 46%, rgba(56,199,216,.18), transparent 30%), radial-gradient(circle at 76% 22%, rgba(201,162,39,.16), transparent 27%)' }} />
      <div className="pointer-events-none absolute inset-0 opacity-[.12]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(56,199,216,.35) 4px)', backgroundSize: '100% 5px' }} />
      <header className="route-map-header relative z-10 shrink-0 px-5 pt-6">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.32em] text-champagne-soft">AR GUIDANCE · ROUTE LOCKED</p>
          <h2 className="font-display mt-1 text-[27px]">way<em className="text-champagne-soft">Fin</em></h2>
        </div>
      </header>

      <div className="route-map-floor-strip relative z-20 mt-2 flex shrink-0 items-center justify-center gap-1.5 px-3">
        {visibleFloors.map((floor) => {
          const active = floor.id === floorId
          const onRoute = routeFloors.includes(floor.id)
          return <button key={floor.id} onClick={() => selectFloor(floor.id)} disabled={!onRoute} aria-current={active ? 'true' : undefined} className={`flex h-9 w-9 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${active ? 'min-h-11 min-w-11 border-champagne bg-champagne/20 text-champagne-soft cursor-pointer' : onRoute ? 'min-h-11 min-w-11 border-cyan/50 bg-cyan/10 text-cyan cursor-pointer' : 'border-ivory/10 bg-obsidian-2/40 text-ivory/25 cursor-not-allowed'}`} aria-label={`${floor.label}${onRoute ? '' : ', not on this route'}`}>{floor.short}</button>
        })}
      </div>

      <div className="route-map-canvas relative z-10 mx-3 mt-2 min-h-0 flex-1">
      <svg viewBox="0 0 340 500" preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label={`${floorLabelOf(floorId)} route map`}>
        <defs>
          <filter id="routeGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="13" y="16" width="314" height="468" rx="28" fill="#131118" stroke="#C9A227" strokeOpacity=".24" />
        <path d="M28 92V34h58M312 92V34h-58M28 408v58h58M312 408v58h-58" fill="none" stroke="#38C7D8" strokeOpacity=".48" strokeWidth="1.5" />
        <path d="M170 29v448M28 250h284" stroke="#38C7D8" strokeOpacity=".09" strokeDasharray="3 8" />
        {floorNodes(floorId).map((node) => { const p = point(node); return <rect key={`${node.type}-${node.name}`} x={p.x - 12} y={p.y - 8} width="24" height="16" rx="3" fill="#0B0A0F" stroke="#F5EFE4" strokeOpacity=".12" /> })}
        {floorNodes(floorId).filter((node) => node.name === route.dest.name || node.name === 'Atrium 1' || node.name === 'Atrium 2' || node.name === 'Parking Lift' || (isParkingRoute && node.type === 'zone')).map((node) => { const p = point(node); return <text key={`label-${node.name}`} x={p.x} y={p.y - 12} textAnchor="middle" fill="#F5EFE4" fillOpacity=".78" fontSize="7" fontWeight="700">{node.name}</text> })}
        {pathD && <motion.path d={pathD} fill="none" stroke="#C9A227" strokeWidth="7" strokeOpacity=".18" strokeLinecap="round" />}
        {pathD && <motion.path d={pathD} fill="none" stroke="#D8B65C" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4 7" filter="url(#routeGlow)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: 'easeOut' }} />}
        {points.length > 1 && <motion.polygon points="0,-7 13,0 0,7" fill="#D8B65C" filter="url(#routeGlow)" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ delay: 0.75, duration: 1.1, repeat: Infinity }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} transform={`translate(${points[Math.max(1, points.length - 2)].x} ${points[Math.max(1, points.length - 2)].y})`} />}
        {floorPath.map((node) => <RouteGlyph key={node.id} node={node} />)}
        {floorId === start.floor && <g transform={`translate(${point(start).x} ${point(start).y})`}><circle r="12" fill="#38C7D8" fillOpacity=".16" /><circle r="6" fill="#38C7D8" /><text x="0" y="22" textAnchor="middle" fill="#38C7D8" fontSize="7" fontWeight="700">YOU</text></g>}
        {isDestinationFloor && <g transform={`translate(${point(route.dest).x} ${point(route.dest).y})`}><circle r="13" fill="none" stroke="#D8B65C" strokeWidth="1" opacity=".7" /><circle r="7" fill="#C9A227" /><circle r="2" fill="#0B0A0F" /></g>}
      </svg>
      </div>

      <motion.div initial={{ y: 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12, duration: 0.34, ease: 'easeOut' }} className="route-map-sheet relative z-20 mx-3 mb-3 mt-2 shrink-0 rounded-[26px] border border-champagne/35 bg-obsidian-2/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold tracking-[.22em] text-champagne-soft">{activeGuidance ? `STEP ${activeGuidance.step} · ` : ''}{floorLabelOf(floorId).toUpperCase()} · {heading}</p><h3 className="font-display mt-1 text-[26px] leading-none">{route.dest.name}</h3><p className="mt-1.5 text-[13px] text-ivory/75"><span className="font-semibold text-champagne-soft">{route.metres} m</span> · about {route.minutes} min</p></div><div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-champagne/40 bg-champagne/10 text-champagne-soft"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg></div></div>
        <div className="mt-3 border-t border-ivory/10 pt-3"><p className="text-[13px] leading-snug text-ivory/90">{mapInstruction}</p>{nextGuidance && <button onClick={advanceGuidance} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-cyan/40 bg-cyan/10 px-4 text-[12px] font-semibold text-cyan transition-colors cursor-pointer active:bg-cyan/20">{nextActionLabel}</button>}<button onClick={onClose} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-ivory/20 bg-ivory/5 px-4 text-[12px] font-semibold text-ivory transition-colors cursor-pointer active:bg-ivory/15" aria-label="Back to wayFin chat">Back to chat</button></div>
      </motion.div>
    </motion.section>
  )
}
