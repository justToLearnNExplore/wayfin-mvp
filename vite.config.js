import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Without these, a new service worker installs in the background but
      // keeps waiting for every open tab to fully close before it takes
      // over — so a fresh deploy can silently keep serving the old cached
      // bundle. This makes updates take effect on the very next reload.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'wayFin — Orion Mall Guide',
        short_name: 'wayFin',
        description: 'The mall, already figured out. AI guide for Orion Mall, Brigade Gateway.',
        theme_color: '#0B0A0F',
        background_color: '#0B0A0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: { host: true },
  // @vercel/analytics/react must be pre-bundled with the rest of the app's
  // React copy from the first dev-server boot; otherwise Vite's lazy
  // dependency discovery can hand it a mismatched React runtime mid-session,
  // surfacing as "Invalid hook call" in dev only (build is unaffected).
  optimizeDeps: { include: ['@vercel/analytics/react'] },
})
