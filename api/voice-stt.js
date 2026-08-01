// Vercel serverless function: /api/voice-stt
//
// Proxies Sarvam AI "Saarika" speech-to-text so SARVAM_API_KEY never reaches
// the browser. Dormant until the key is configured; the client falls back to
// the browser's own Web Speech recognition when this returns 503.
//
// Saarika handles Indian English and code-mixed speech ("mujhe Nykaa jaana
// hai") markedly better than Web Speech, which is the reason to route here at
// all. It transcribes a complete clip, so there are no interim results.

export const config = {
  api: {
    // We forward the raw multipart body straight through to Sarvam.
    bodyParser: false,
  },
}

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text'

/** Reject anything implausibly large for a single spoken utterance. */
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Collect a Node request stream into a Buffer.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        reject(new Error('too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const key = process.env.SARVAM_API_KEY
  if (!key) return res.status(503).json({ error: 'sarvam_not_configured' })

  const contentType = req.headers['content-type']
  if (!contentType?.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'expected_multipart' })
  }

  try {
    const body = await readBody(req)

    // Pass the multipart payload through untouched, preserving the boundary.
    // Wrapped in a Blob because Buffer is not a valid BodyInit, and Blob is
    // the one representation both the DOM and Node fetch typings agree on.
    const response = await fetch(SARVAM_STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': key, 'Content-Type': contentType },
      body: new Blob([new Uint8Array(body)], { type: contentType }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return res.status(502).json({ error: 'stt_error', detail: detail.slice(0, 200) })
    }

    const data = await response.json()
    return res.status(200).json({
      transcript: typeof data?.transcript === 'string' ? data.transcript : '',
      language: data?.language_code ?? null,
    })
  } catch (err) {
    const tooLarge = /** @type {Error} */ (err)?.message === 'too_large'
    return res.status(tooLarge ? 413 : 500).json({ error: tooLarge ? 'too_large' : 'stt_failed' })
  }
}
