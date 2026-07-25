import { track } from '@vercel/analytics'

// Thin wrapper so every call site stays terse and a bad property never
// crashes the app. Events land in Vercel → Project → Analytics → Events,
// which is where "how many people used wayFin this week" comes from for
// mall-operator conversations — no separate database to stand up.
export function trackEvent(name, props) {
  try {
    track(name, props)
  } catch {
    // analytics must never break the app
  }
}
