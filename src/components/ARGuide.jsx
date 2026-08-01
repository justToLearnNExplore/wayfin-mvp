import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'

// Compass-AR walking guide (Ground-floor scope). This is honest web AR: a live
// camera feed with a gold route ribbon + marching chevrons that swing toward
// the real-world direction of the next waypoint as the phone rotates. It uses
// RELATIVE calibration (the user aligns once by pointing down the corridor),
// which is robust indoors where the magnetometer is unreliable. It does NOT do
// SLAM/floor-locking — that needs native ARCore/ARKit + a VPS scan.

// clockwise bearing (deg) from map "up" (−y) for a segment a→b
const bearing = (a, b) => {
  const ang = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI
  return (ang + 360) % 360
}
const norm180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180

// sample a quadratic bezier at t
const qbez = (p0, p1, p2, t) => {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}

export default function ARGuide({ route, onClose }) {
  const videoRef = useRef(null)
  const [phase, setPhase] = useState('intro') // intro → live | nocam
  const [stepIdx, setStepIdx] = useState(0)

  // ground-floor waypoints of this route
  const waypoints = useMemo(() => route.path.filter((n) => n.floor === 'G'), [route.path])
  const segCount = Math.max(1, waypoints.length - 1)
  const seg = Math.min(stepIdx, segCount - 1)
  const from = waypoints[seg]
  const to = waypoints[Math.min(seg + 1, waypoints.length - 1)]
  const segBearing = useMemo(() => (from && to ? bearing(from, to) : 0), [from, to])
  const atEnd = seg >= segCount - 1

  // relative-heading calibration
  const headingRef = useRef(0) // latest raw compass value (any origin, clockwise)
  const headingSeenRef = useRef(false) // has a real compass event ever arrived?
  const refHeadingRef = useRef(null) // heading captured at "align"
  const refSegBearingRef = useRef(0) // segBearing captured at "align"
  const [arrowAngle, setArrowAngle] = useState(0) // where to point, rel. to phone forward

  // ---- camera ----
  useEffect(() => {
    if (phase !== 'live') return
    let stream
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch {
        setPhase('nocam')
      }
    })()
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [phase])

  // ---- compass ----
  useEffect(() => {
    if (phase !== 'live' && phase !== 'nocam') return
    const onOrient = (e) => {
      let h
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading // iOS, cw from N
      else if (typeof e.alpha === 'number') h = 360 - e.alpha // Android absolute → cw
      else return
      headingRef.current = h
      headingSeenRef.current = true
    }
    window.addEventListener('deviceorientationabsolute', onOrient)
    window.addEventListener('deviceorientation', onOrient)
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [phase])

  // ---- rAF: derive arrow angle from calibrated delta ----
  useEffect(() => {
    if (phase !== 'live' && phase !== 'nocam') return
    let raf
    const tick = () => {
      if (refHeadingRef.current != null && headingSeenRef.current) {
        const deviceDelta = norm180(headingRef.current - refHeadingRef.current)
        const segDelta = norm180(segBearing - refSegBearingRef.current)
        setArrowAngle(norm180(segDelta - deviceDelta))
      } else {
        // no compass yet → straight guiding ribbon (safe forward default)
        setArrowAngle(0)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, segBearing])

  const calibrate = () => {
    refHeadingRef.current = headingRef.current
    refSegBearingRef.current = segBearing
    setArrowAngle(0)
  }

  const start = async () => {
    // iOS gesture-gated motion permission
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)
        await DeviceOrientationEvent.requestPermission()
    } catch {}
    setPhase('live')
    // seed calibration on first frame so arrows start pointing forward
    setTimeout(calibrate, 200)
  }

  // remaining distance (sum of remaining G-floor segments, metres)
  const remaining = useMemo(() => {
    let m = 0
    for (let i = seg; i < waypoints.length - 1; i++) {
      const a = waypoints[i]
      const b = waypoints[i + 1]
      m += Math.hypot((a.x - b.x) * 2, (a.y - b.y) * 0.4)
    }
    return Math.round(m)
  }, [seg, waypoints])

  // ---- ribbon geometry (screen space) ----
  const W = 390
  const H = 780
  const clampedAngle = Math.max(-55, Math.min(55, arrowAngle))
  const behind = Math.abs(arrowAngle) > 120
  const offRange = Math.abs(arrowAngle) > 55
  const aligned = Math.abs(arrowAngle) < 12

  const p0 = { x: W / 2, y: H * 0.98 }
  const vanish = { x: W / 2 + clampedAngle * 3.2, y: H * 0.46 }
  const p1 = { x: (p0.x + vanish.x) / 2 + clampedAngle * 1.4, y: H * 0.74 }
  const ribbonD = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${vanish.x} ${vanish.y}`
  const chevs = [0.24, 0.46, 0.68, 0.88].map((t) => {
    const pt = qbez(p0, p1, vanish, t)
    const scale = 1 - t * 0.82
    return { ...pt, scale, t }
  })

  const turnWord = arrowAngle > 0 ? 'right' : 'left'

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] overflow-hidden bg-[#0B0A0F] text-[#F5EFE4]"
    >
      {/* camera feed */}
      {phase === 'live' && (
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      )}
      {/* corridor fallback backdrop when no camera */}
      {phase !== 'live' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 30%, #17141d, #0B0A0F 70%), repeating-linear-gradient(0deg, transparent 0 3px, rgba(56,199,216,.04) 4px 5px)',
          }}
        />
      )}
      {/* legibility scrim */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,10,15,.72) 0%, transparent 22%, transparent 58%, rgba(11,10,15,.55) 100%)' }} />

      {/* ---- intro / permission gate ---- */}
      {phase === 'intro' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-8 text-center">
          <div
            className="mb-6 h-14 w-14"
            style={{
              background: 'conic-gradient(from 210deg,#7C5CFF,#E84A8A,#F2A03D,#38C7D8,#7C5CFF)',
              clipPath: 'polygon(50% 0,100% 28%,88% 100%,12% 100%,0 28%)',
              borderRadius: 14,
            }}
          />
          <h2 className="font-display text-[26px]">AR Walk</h2>
          <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-ivory/70">
            Point your phone straight down the corridor ahead, then tap <b className="text-champagne-soft">Align</b>. The
            golden path will lead you to <b className="text-champagne-soft">{route.dest.name}</b>.
          </p>
          <button
            onClick={start}
            className="mt-7 rounded-full border border-champagne/60 bg-champagne/15 px-8 py-3.5 text-[14px] font-extrabold tracking-wide text-champagne-soft cursor-pointer"
          >
            Align &amp; start
          </button>
          <button onClick={onClose} className="mt-4 text-[12px] font-semibold text-ivory/50 cursor-pointer">
            Back to map
          </button>
        </div>
      )}

      {/* ---- AR overlay ---- */}
      {(phase === 'live' || phase === 'nocam') && (
        <>
          {/* mission banner */}
          <div className="absolute left-0 right-0 top-0 z-20 px-5 pt-12">
            <p className="text-[10px] font-semibold tracking-[0.32em] text-champagne-soft">AR WALK · GROUND FLOOR</p>
            <h1 className="font-display flex items-baseline gap-3 text-[30px]">
              <span className="text-champagne-soft">→</span> {route.dest.name}
              <span className="font-body text-[15px] font-extrabold text-cyan" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {remaining} m
              </span>
            </h1>
            {phase === 'nocam' && (
              <p className="mt-1 text-[11px] text-ivory/55">Camera off — showing the guide over a corridor view.</p>
            )}
          </div>

          {/* route ribbon + chevrons (hidden when target is off-screen or behind) */}
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 z-10 h-full w-full" preserveAspectRatio="xMidYMid slice">
            {!offRange && !behind && (
              <>
                <path d={ribbonD} fill="none" stroke="#C9A227" strokeWidth="30" strokeOpacity=".16" strokeLinecap="round" />
                <path
                  d={ribbonD}
                  fill="none"
                  stroke="#E8C96A"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray="10 16"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(216,182,92,.85))', animation: 'arflow 1s linear infinite' }}
                />
                {chevs.map((c, i) => (
                  <g key={i} transform={`translate(${c.x} ${c.y}) scale(${c.scale})`} style={{ filter: 'drop-shadow(0 0 8px rgba(216,182,92,.8))' }}>
                    <polygon points="0,-22 30,14 0,2 -30,14" fill={aligned ? '#F4E3AE' : '#D8B65C'} opacity={0.55 + c.scale * 0.45} />
                  </g>
                ))}
                {/* destination beacon at vanishing point */}
                {aligned && atEnd && (
                  <g transform={`translate(${vanish.x} ${vanish.y})`}>
                    <circle r="26" fill="none" stroke="#D8B65C" strokeOpacity=".5">
                      <animate attributeName="r" values="16;30;16" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle r="9" fill="#F4E3AE" />
                  </g>
                )}
              </>
            )}
          </svg>

          {/* off-screen / turn-around guidance */}
          {(offRange || behind) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
              <motion.div
                animate={{ x: behind ? 0 : arrowAngle > 0 ? [0, 18, 0] : [0, -18, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
                style={{ filter: 'drop-shadow(0 0 16px rgba(216,182,92,.9))' }}
              >
                <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: behind ? 'none' : `rotate(${arrowAngle > 0 ? 90 : -90}deg)` }}>
                  <polygon points="60,10 100,70 60,52 20,70" fill="#E8C96A" />
                </svg>
              </motion.div>
              <p className="mt-4 font-display text-[22px]">{behind ? 'Turn around' : `Turn ${turnWord}`}</p>
            </div>
          )}

          {/* aligned tick */}
          {aligned && !atEnd && (
            <div className="absolute left-1/2 top-[38%] z-10 -translate-x-1/2 rounded-full border border-cyan/50 bg-cyan/10 px-3 py-1 text-[10px] font-bold tracking-widest text-cyan">
              ON PATH
            </div>
          )}

          {/* step instruction */}
          <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-5">
            <div className="rounded-[22px] border border-champagne/35 bg-obsidian-2/90 p-4 backdrop-blur-xl">
              <p className="font-display text-[16px] leading-snug text-ivory/90">
                {waypoints[Math.min(seg + 1, waypoints.length - 1)]
                  ? atEnd
                    ? `${route.dest.name} is just ahead.`
                    : `Head toward ${to?.name}.`
                  : 'Follow the path.'}
              </p>
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  onClick={calibrate}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-ivory/20 bg-ivory/5 px-3.5 text-[12px] font-bold text-ivory/80 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                  Re-center
                </button>
                <button
                  onClick={() => (atEnd ? onClose() : setStepIdx((i) => i + 1))}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-champagne/60 bg-champagne/15 text-[13px] font-extrabold tracking-wide text-champagne-soft cursor-pointer"
                >
                  {atEnd ? 'ARRIVED' : 'NEXT TURN'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  aria-label="Exit AR"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-ivory/20 text-ivory/70 cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes arflow { to { stroke-dashoffset: -26; } }`}</style>
    </motion.div>,
    document.body
  )
}
