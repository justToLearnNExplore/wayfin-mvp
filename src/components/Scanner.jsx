import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { findProductById, MVP_DEMO_PRODUCT_ID } from '../data/products.js'

// A single-photo, store-scoped MVP walkthrough. It captures a product image,
// then resolves the one approved NEW ME catalogue item locally. Prices and
// sizes remain catalogue data; it intentionally never renders lookalikes.
export default function Scanner({ onMatch, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraState, setCameraState] = useState('starting') // starting | live | unavailable
  const [status, setStatus] = useState('viewfinder') // viewfinder | matching | matched | unmatched
  const [captured, setCaptured] = useState(null)
  const [product, setProduct] = useState(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1440 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelled) return stream.getTracks().forEach((track) => track.stop())
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (!cancelled) setCameraState('live')
      } catch {
        if (!cancelled) setCameraState('unavailable')
      }
    })()

    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const submitCapture = async (image) => {
    setCaptured(image)
    setProduct(null)
    setStatus('matching')
    const match = await onMatch(image)
    if (match) {
      setProduct(match)
      setStatus('matched')
    } else {
      setStatus('unmatched')
    }
  }

  const captureImage = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return null
    const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.86)
  }

  const captureProduct = async () => {
    if (status === 'matching') return
    const image = captureImage()
    if (!image) return
    attemptRef.current += 1
    if (attemptRef.current === 1) {
      setCaptured(image)
      setProduct(null)
      setStatus('matching')
      await new Promise((resolve) => setTimeout(resolve, 350))
      setStatus('unmatched')
      return
    }
    await submitCapture(image)
  }

  const captureOtherProduct = async () => {
    if (status === 'matching') return
    setCaptured(captureImage())
    setProduct(null)
    setStatus('matching')
    await new Promise((resolve) => setTimeout(resolve, 350))
    setStatus('unmatched')
  }

  const reset = () => {
    setCaptured(null)
    setProduct(null)
    setStatus('viewfinder')
  }

  const format = (value) => `₹${value.toLocaleString('en-IN')}`
  const saving = product ? product.storePrice - product.onlinePrice : 0

  return createPortal(
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-label="Smart product match"
      className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-y-auto bg-obsidian text-ivory"
    >
      <header className="flex items-center justify-between px-5 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div>
          <h2 className="font-display text-[21px]">Scan the product</h2>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-champagne-soft">
            SMART PRODUCT MATCH · MVP
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close product scanner"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ivory/20 text-ivory/75 cursor-pointer active:bg-ivory/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="relative mx-auto mt-7 aspect-square w-[min(82vw,360px,46dvh)] shrink-0 overflow-hidden rounded-[28px] border border-champagne/45 bg-black shadow-2xl">
        {captured && status !== 'viewfinder' ? (
          <img src={captured} alt="Captured product" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        )}

        {cameraState !== 'live' && status === 'viewfinder' && (
          <div className="absolute inset-0 flex items-center justify-center px-7 text-center text-[13px] leading-relaxed text-ivory/65">
            {cameraState === 'starting'
              ? 'Opening the camera…'
              : 'Camera is unavailable here. You can still try a verified demo capture below.'}
          </div>
        )}

        {['top-4 left-4 border-t-2 border-l-2 rounded-tl-xl', 'top-4 right-4 border-t-2 border-r-2 rounded-tr-xl', 'bottom-4 left-4 border-b-2 border-l-2 rounded-bl-xl', 'bottom-4 right-4 border-b-2 border-r-2 rounded-br-xl'].map((classes) => (
          <div key={classes} className={`pointer-events-none absolute h-9 w-9 border-champagne ${classes}`} />
        ))}

        <AnimatePresence>
          {status === 'matching' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian/80 px-8 text-center backdrop-blur-sm"
            >
              <motion.div
                className="h-11 w-11 rounded-full border-2 border-champagne border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
              <p className="mt-4 font-display text-[21px] text-ivory">Matching the NEW ME demo item</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ivory/60">One store, one catalogue result. No lookalikes.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-[430px] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        {status === 'viewfinder' && (
          <>
            <p className="mx-auto max-w-[310px] text-center text-[12px] leading-relaxed text-ivory/60">
              Frame the product and its store label. Wayfin returns an exact catalogue item or no result.
            </p>
            <button
              onClick={captureProduct}
              disabled={cameraState !== 'live'}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-champagne/70 bg-champagne/15 px-4 text-[13px] font-extrabold text-champagne-soft transition-colors cursor-pointer active:bg-champagne/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Scan product
            </button>
          </>
        )}

        {status === 'matched' && product && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] border border-cyan/45 bg-obsidian-2/95 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.18em] text-cyan">MVP CATALOGUE MATCH</p>
                <h3 className="mt-1 font-display text-[23px] leading-tight text-ivory">{product.name}</h3>
                <p className="mt-1 text-[12px] font-semibold text-champagne-soft">{product.store} · Orion Mall</p>
              </div>
              <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2.5 py-1 text-[10px] font-extrabold text-cyan">SIZE {product.size}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Price comparison">
              <div className="rounded-xl border border-ivory/10 bg-ivory/5 p-3">
                <p className="text-[10px] font-semibold text-ivory/55">IN STORE</p>
                <p className="mt-1 font-display text-[23px] text-ivory">{format(product.storePrice)}</p>
              </div>
              <div className="rounded-xl border border-champagne/40 bg-champagne/10 p-3">
                <p className="text-[10px] font-semibold text-champagne-soft">{product.brand} ONLINE</p>
                <p className="mt-1 font-display text-[23px] text-champagne-soft">{format(product.onlinePrice)}</p>
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-ivory/70">
              {saving > 0 ? `${format(saving)} lower online.` : 'The mall price is the better buy right now.'}{' '}
              Other online sizes: <span className="font-semibold text-ivory">{product.otherSizes.join(', ')}</span>
            </p>

            <div className="mt-4 flex gap-2">
              <a
                href={product.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-champagne/65 bg-champagne/15 px-3 text-center text-[12px] font-extrabold text-champagne-soft active:bg-champagne/30"
              >
                Open {product.brand} online
              </a>
              <button
                onClick={reset}
                className="flex min-h-12 items-center justify-center rounded-xl border border-ivory/20 px-3 text-[12px] font-bold text-ivory/80 cursor-pointer active:bg-ivory/10"
              >
                Scan another
              </button>
            </div>
          </motion.div>
        )}

        {status === 'unmatched' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] border border-magenta/45 bg-magenta/10 p-4 text-center">
            <p className="font-display text-[22px] text-ivory">No exact product match</p>
            <p className="mt-2 text-[12px] leading-relaxed text-ivory/65">Try again with the product front and brand label in frame. We won’t suggest a similar item.</p>
            <button onClick={reset} className="mt-4 min-h-12 rounded-xl border border-ivory/25 px-5 text-[12px] font-extrabold text-ivory cursor-pointer active:bg-ivory/10">Try again</button>
          </motion.div>
        )}

        {cameraState === 'unavailable' && status === 'viewfinder' && (
          <div className="mt-6 border-t border-ivory/10 pt-5">
            <p className="text-center text-[10px] font-semibold tracking-[0.16em] text-ivory/45">MVP DEMO CAPTURE</p>
            <button
              onClick={() => submitCapture(null)}
              className="mt-3 min-h-12 w-full rounded-xl border border-champagne/35 bg-champagne/5 px-3 text-left text-[12px] font-semibold text-ivory cursor-pointer active:bg-champagne/20"
            >
              <span>{findProductById(MVP_DEMO_PRODUCT_ID)?.name}</span>
              <span className="ml-2 text-[10px] font-medium text-ivory/50">NEW ME</span>
            </button>
            <button
              onClick={captureOtherProduct}
              className="mt-2 min-h-11 w-full rounded-xl border border-ivory/20 px-3 text-[12px] font-bold text-ivory/75 cursor-pointer active:bg-ivory/10"
            >
              Try a non-NEW ME product
            </button>
          </div>
        )}
      </div>
    </motion.section>,
    document.body
  )
}
