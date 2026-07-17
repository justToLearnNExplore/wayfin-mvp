import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { PRODUCTS } from '../data/products.js'

// Full-screen barcode scanner. Tries the camera via ZXing; if the camera is
// unavailable (permissions, desktop, http) the demo products keep the flow alive.
export default function Scanner({ onResult, onClose }) {
  const videoRef = useRef(null)
  const [cameraState, setCameraState] = useState('starting') // starting | live | unavailable

  useEffect(() => {
    let controls = null
    let cancelled = false
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            controls?.stop()
            onResult(result.getText())
          }
        })
        if (!cancelled) setCameraState('live')
      } catch {
        if (!cancelled) setCameraState('unavailable')
      }
    })()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onResult])

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-[#0B0A0F] text-[#F5EFE4]"
    >
      <div className="flex items-center justify-between px-5 pt-12">
        <div>
          <div className="font-display text-[20px]">Scan the barcode</div>
          <div className="text-[10.5px] font-semibold tracking-[0.2em] text-[#D8B65C]">
            PRICE CHECK · WAYFIN
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#F5EFE4]/20 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* viewfinder */}
      <div className="relative mx-auto mt-8 aspect-square w-[78%] max-w-[340px] overflow-hidden rounded-3xl border border-[#C9A227]/40 bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {cameraState !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12.5px] text-[#F5EFE4]/60">
            {cameraState === 'starting' ? 'Waking the camera…' : 'Camera unavailable here — use a demo product below.'}
          </div>
        )}
        {/* gold corner brackets */}
        {[
          'top-3 left-3 border-t-2 border-l-2 rounded-tl-lg',
          'top-3 right-3 border-t-2 border-r-2 rounded-tr-lg',
          'bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg',
          'bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg',
        ].map((cls) => (
          <div key={cls} className={`pointer-events-none absolute h-8 w-8 border-[#C9A227] ${cls}`} />
        ))}
        {/* scan line */}
        <motion.div
          className="pointer-events-none absolute left-4 right-4 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #E84A8A, transparent)' }}
          animate={{ top: ['12%', '88%', '12%'] }}
          transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
        />
      </div>

      <div className="mt-8 px-6">
        <p className="text-center text-[11px] font-semibold tracking-[0.2em] text-[#F5EFE4]/45">
          NO BARCODE HANDY? TRY A DEMO PRODUCT
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {PRODUCTS.map((p) => (
            <button
              key={p.barcode}
              onClick={() => onResult(p.barcode)}
              className="rounded-2xl border border-[#C9A227]/40 bg-[#C9A227]/5 px-4 py-3 text-left text-[13px] font-semibold active:bg-[#C9A227]/20 transition-colors cursor-pointer"
            >
              {p.name}
              <span className="block text-[11px] font-normal text-[#F5EFE4]/55">
                {p.store} · ₹{p.storePrice}
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>,
    document.body
  )
}
