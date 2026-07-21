# Wayfin — Intelligent AI Indoor Navigation

Wayfin is a QR-first progressive web app that makes complex indoor spaces feel conversational and navigable. Instead of asking visitors to decode a static kiosk or floor-plan image, Wayfin lets them ask for what they need and guides them with deterministic routes and an interactive visual map.

The current MVP is demonstrated with Orion Mall and is designed to extend to airports, hospitals, campuses, museums, and other large indoor spaces.

## What it does

- Interprets natural-language requests such as “Take me from Zone A, P1 to UNIQLO”.
- Translates the request into structured intent with the OpenAI Responses API, then calculates the route deterministically.
- Shows a mobile-first visual route with floors, landmarks, nearby stores, and turn-by-turn instructions.
- Helps visitors discover stores, save a parking location, find friends, and compare a store-scoped product with its exact online catalogue entry.
- Works as a PWA: visitors scan a QR code and open Wayfin without installing a native app.

## Built with

JavaScript, React, Vite, Tailwind CSS, Vite PWA, Framer Motion, SVG/CSS 3D, ZXing, OpenAI Responses API (`gpt-4o-mini`), Vercel Serverless Functions, and Vercel.

## AI-assisted development

Wayfin began as an early prototype developed with Claude. I then continued the same codebase with Codex powered by GPT-5.6.

Codex read the existing React/Vite architecture and extended it without restarting the project: it refined the mobile PWA experience, strengthened deterministic indoor-routing flows, added the interactive visual-navigation experience, and implemented the store-scoped NEW ME product-match MVP.

GPT-5.6 was used as a development collaborator for architecture review, debugging, UI responsiveness, route-flow design, and validating that the OpenAI layer converts natural-language requests into structured intent while deterministic routing remains reliable.

## Run locally

```bash
npm install
npm run dev
```

For OpenAI intent parsing, configure the required server-side environment variables before deploying.
