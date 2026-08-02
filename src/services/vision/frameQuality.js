/**
 * @file Free, local triage of a camera frame before we spend a vision call.
 *
 * WHY THIS EXISTS. Automatic re-localization photographs the mall without
 * being asked, so most frames it grabs are junk: motion-blurred mid-stride,
 * pointed at a blank wall, or too dark under a shop awning. Sending those to
 * the vision endpoint costs money and latency to be told "no match".
 *
 * Everything here runs on a ~160 px thumbnail on the main thread in well under
 * a millisecond, and rejects the obvious failures for nothing. Only frames
 * that survive get uploaded.
 *
 * The four signals, applied in this order:
 *
 *   BRIGHTNESS   mean luma. Rejects the inside of a pocket and a frame shot
 *                straight into a skylight.
 *   CONTRAST     standard deviation of luma. This is what separates "nothing
 *                here" from "something here, out of focus" — see the note
 *                below on why sharpness alone cannot.
 *   EDGE DENSITY fraction of pixels sitting on a strong edge. A cheap proxy
 *                for "is there signage in shot": lettering and shopfront trim
 *                produce dense edges, whereas an evenly lit wall — however
 *                well exposed and however high its contrast across the frame —
 *                produces almost none.
 *   SHARPNESS    variance of the Laplacian, the standard blur metric. Checked
 *                last, once we know there is genuinely something to be in
 *                focus.
 *
 * WHY SHARPNESS IS NOT CHECKED FIRST. Variance of the Laplacian measures
 * high-frequency energy, and a blank wall has none for the same reason a
 * motion-blurred sign has none. Measured on synthetic frames, a flat wall
 * scores 0.0 and a smooth gradient 0.5 — indistinguishable from severe blur,
 * yet their global contrast is 0 and 46 respectively. Leading with sharpness
 * would therefore report "blurry" for a perfectly focused photo of nothing,
 * which is a misleading thing to find in a log when tuning this on-site.
 *
 * THRESHOLDS ARE HEURISTICS, AND THESE ONES ARE SYNTHETIC. They are calibrated
 * against generated test patterns, not against real Orion frames, and the
 * absolute scale of the Laplacian variance depends on the analysis resolution.
 * They are deliberately permissive: a false accept costs one wasted API call,
 * a false reject costs a correction the user can still trigger by hand. Re-tune
 * against real captures on-site before trusting the numbers.
 */

/** Mean luma (0..255) below which the frame is too dark to read. */
export const MIN_BRIGHTNESS = 35

/** Mean luma above which the frame is blown out. */
export const MAX_BRIGHTNESS = 232

/**
 * Luma standard deviation below which the frame holds no subject at all.
 * A blank corridor wall measures ~0; anything with a shopfront in it is well
 * clear of this.
 */
export const MIN_CONTRAST = 12

/**
 * Variance of the Laplacian below which the frame is treated as blurred.
 *
 * For scale, on the synthetic bar pattern used in the tests: in focus ~8600,
 * lightly blurred ~340, heavily blurred ~100.
 */
export const MIN_SHARPNESS = 120

/** |Laplacian| above which a pixel counts as sitting on a strong edge. */
export const EDGE_MAGNITUDE = 18

/** Fraction of pixels on strong edges below which the frame is featureless. */
export const MIN_EDGE_DENSITY = 0.012

/**
 * @typedef {Object} FrameScore
 * @property {number} brightness   Mean luma, 0..255.
 * @property {number} contrast     Standard deviation of luma.
 * @property {number} sharpness    Variance of the Laplacian.
 * @property {number} edgeDensity  Fraction of pixels on a strong edge, 0..1.
 * @property {boolean} usable      True when the frame is worth uploading.
 * @property {'too-dark' | 'too-bright' | 'blurry' | 'featureless' | 'too-small' | null} reason
 *   Why it was rejected, or null when usable.
 */

/**
 * @typedef {Object} GrayFrame
 * @property {Uint8ClampedArray} data RGBA bytes, 4 per pixel.
 * @property {number} width
 * @property {number} height
 */

/**
 * Triage one frame.
 *
 * Accepts anything ImageData-shaped, so it can be unit-tested against
 * synthetic pixel buffers with no canvas and no browser.
 *
 * @param {GrayFrame | ImageData} frame
 * @returns {FrameScore}
 */
export function scoreFrame(frame) {
  const { data, width, height } = frame

  // The Laplacian kernel needs a one-pixel border on every side.
  if (width < 3 || height < 3) {
    const empty = { brightness: 0, contrast: 0, sharpness: 0, edgeDensity: 0 }
    return { ...empty, usable: false, reason: 'too-small' }
  }

  // Rec. 601 luma. One pass, kept in a Float32Array so the Laplacian below
  // reads sequential memory rather than striding over RGBA quads. Mean and
  // mean-of-squares are accumulated here so contrast is free.
  const gray = new Float32Array(width * height)
  let lumaSum = 0
  let lumaSumSq = 0
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[p] = luma
    lumaSum += luma
    lumaSumSq += luma * luma
  }
  const brightness = lumaSum / gray.length
  const contrast = Math.sqrt(Math.max(0, lumaSumSq / gray.length - brightness * brightness))

  // Exposure first: a black frame has no meaningful contrast or sharpness, so
  // measuring either of them would only produce a misleading reason string.
  if (brightness < MIN_BRIGHTNESS) {
    return { brightness, contrast, sharpness: 0, edgeDensity: 0, usable: false, reason: 'too-dark' }
  }
  if (brightness > MAX_BRIGHTNESS) {
    return { brightness, contrast, sharpness: 0, edgeDensity: 0, usable: false, reason: 'too-bright' }
  }

  // Nothing in shot at all. Caught before the Laplacian so it is never
  // misreported as blur.
  if (contrast < MIN_CONTRAST) {
    return { brightness, contrast, sharpness: 0, edgeDensity: 0, usable: false, reason: 'featureless' }
  }

  // 4-neighbour Laplacian, accumulating variance and edge count together.
  let sum = 0
  let sumSq = 0
  let strongEdges = 0
  let n = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]
      sum += lap
      sumSq += lap * lap
      if (lap > EDGE_MAGNITUDE || lap < -EDGE_MAGNITUDE) strongEdges++
      n++
    }
  }

  const mean = sum / n
  const sharpness = Math.max(0, sumSq / n - mean * mean)
  const edgeDensity = strongEdges / n

  // A smooth gradient — an evenly washed wall — clears the contrast test but
  // carries no detail a recogniser could name.
  if (edgeDensity < MIN_EDGE_DENSITY) {
    return { brightness, contrast, sharpness, edgeDensity, usable: false, reason: 'featureless' }
  }

  // Only now, knowing there is a subject, does "out of focus" mean anything.
  if (sharpness < MIN_SHARPNESS) {
    return { brightness, contrast, sharpness, edgeDensity, usable: false, reason: 'blurry' }
  }

  return { brightness, contrast, sharpness, edgeDensity, usable: true, reason: null }
}
