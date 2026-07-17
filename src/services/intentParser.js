// Client for the /api/intent serverless function (see api/intent.js).
// Returns a structured intent object, or null when the parser is unreachable
// (no deploy, no key, offline, timeout) — callers must fall back to the local
// rule-based matcher, so the bot always works without the LLM.
//
// Shape: { intent: 'navigate'|'friend'|'parking'|'offers'|'store_search'|'unknown',
//          origin, destination, category, friendLocation, parkingLevel: string|null,
//          confidence: number }

const INTENTS = ['navigate', 'friend', 'parking', 'offers', 'store_search', 'unknown']

export async function parseIntent(message) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch('/api/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !INTENTS.includes(data.intent)) return null
    return {
      intent: data.intent,
      origin: data.origin ?? null,
      destination: data.destination ?? null,
      category: data.category ?? null,
      friendLocation: data.friendLocation ?? null,
      parkingLevel: data.parkingLevel ?? null,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    }
  } catch {
    return null
  }
}
