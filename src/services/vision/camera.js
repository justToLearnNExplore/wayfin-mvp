/**
 * @file Rear-camera capture helpers.
 *
 * Kept separate from the recogniser so the camera can be reused (price
 * scanning, QR checkpoints, visual localization) without dragging the vision
 * API along, and so it can be exercised without a network.
 */

/**
 * @typedef {'idle' | 'starting' | 'live' | 'denied' | 'unavailable'} CameraState
 */

/**
 * Open the rear-facing camera and bind it to a <video> element.
 *
 * Requires a secure context (https or localhost) — Safari and Chrome both
 * refuse getUserMedia over plain http, which is the usual cause of an
 * unexplained "unavailable" on a LAN-IP demo.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<{stream: MediaStream | null, state: CameraState}>}
 */
export async function openRearCamera(videoEl) {
  if (!globalThis.isSecureContext) return { stream: null, state: 'unavailable' }
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, state: 'unavailable' }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1440 },
        height: { ideal: 1440 },
      },
      audio: false,
    })
    videoEl.srcObject = stream
    videoEl.setAttribute('playsinline', 'true')
    await videoEl.play().catch(() => {})
    return { stream, state: 'live' }
  } catch (err) {
    const name = /** @type {any} */ (err)?.name
    return {
      stream: null,
      state: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
    }
  }
}

/**
 * Stop every track on a stream and release the camera light.
 * @param {MediaStream | null | undefined} stream
 */
export function closeCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Grab the current video frame as a compressed JPEG data URL.
 *
 * Downscaled to `maxDim` before encoding: vision models gain nothing from a
 * 4K frame, and the upload is the slowest part of the round trip on mall wifi.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {number} [maxDim] Longest edge, in pixels.
 * @param {number} [quality] JPEG quality 0..1.
 * @returns {string | null} data URL, or null if the video has no frame yet.
 */
export function captureFrame(videoEl, maxDim = 1100, quality = 0.82) {
  if (!videoEl?.videoWidth) return null

  const scale = Math.min(1, maxDim / Math.max(videoEl.videoWidth, videoEl.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(videoEl.videoWidth * scale)
  canvas.height = Math.round(videoEl.videoHeight * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/jpeg', quality)
}
