// Vercel serverless function: /api/voice-tts
//
// Proxies Sarvam AI "Bulbul" text-to-speech so SARVAM_API_KEY never reaches
// the browser. Dormant until the key is configured.
//
//   GET  -> { enabled: boolean }   capability probe used by the client
//   POST -> { audioBase64, mimeType }
//
// Bulbul is TEXT-TO-SPEECH (spoken guidance out). Saarika, in voice-stt.js,
// is the speech-to-text counterpart — the two are commonly confused.

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech'

/** Bulbul speaker best suited to navigation prompts. */
const DEFAULT_SPEAKER = 'anushka'

/** Sarvam rejects very long inputs; guidance lines are short by design. */
const MAX_CHARS = 480

export default async function handler(req, res) {
  const key = process.env.SARVAM_API_KEY

  // Capability probe — lets the PWA decide whether to upgrade from Web Speech.
  if (req.method === 'GET') {
    return res.status(200).json({ enabled: Boolean(key) })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' })
  if (!key) return res.status(503).json({ error: 'sarvam_not_configured' })

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text || text.length > MAX_CHARS) return res.status(400).json({ error: 'invalid_text' })

  const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'en-IN'
  const rate = Number(req.body?.rate) || 1

  try {
    const response = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: lang,
        speaker: DEFAULT_SPEAKER,
        pace: Math.max(0.5, Math.min(2, rate)),
        model: 'bulbul:v2',
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return res.status(502).json({ error: 'tts_error', detail: detail.slice(0, 200) })
    }

    const data = await response.json()
    const audioBase64 = Array.isArray(data?.audios) ? data.audios[0] : null
    if (!audioBase64) return res.status(502).json({ error: 'empty_audio' })

    return res.status(200).json({ audioBase64, mimeType: 'audio/wav' })
  } catch {
    return res.status(500).json({ error: 'tts_failed' })
  }
}
