# NanoVPN UX Polish (Layer 2.7) — Design

**Date:** 2026-06-21 · **Status:** approved · **Branch:** `feat/ux-polish`

A focused polish pass on the live app (https://nanovpn-web.vercel.app), driven by hands-on
feedback after the deploy. Two design changes (map look, agent form) + four bug fixes. No
backend changes; the deployed edge-node / Supabase / settlement flow are untouched.

## 1. Map — flat NordVPN-style world map (replaces the 3D globe)

**Why:** the realistic `react-globe.gl` globe reads as "cheap" and can't be panned/zoomed like a
real VPN app. Target = NordVPN's flat, dark, minimal, slideable 2D map.

**What:** a new `WorldMap` component replacing `GlobeMap` (delete `GlobeMap.tsx`), built on
**react-simple-maps** (SVG + d3-geo — lightweight, no API key, fully stylable). If its peer-deps
fight this project's React version, fall back to a hand-rolled `d3-geo` + SVG map with the same
look and no extra dependency (decided at implementation time).

- **Look:** dark muted landmasses (`~#1b2330`) with thin borders on the near-black stage; the
  ocean is the stage background. Pure, flat, professional — no photo texture, no atmosphere glow.
- **Node pins:** glowing green dots (`--green` `#15d687`) with a soft halo; the selected node gets
  a brighter fill + a pulsing ring. Click a pin to select (only when not connected, matching today).
- **Pan + zoom:** `ZoomableGroup` — drag to slide, wheel to zoom, plus **`+` / `−` buttons bottom-right**
  (NordVPN-style). Default to a moderately zoomed, centered view (not the whole tiny world).
- **Selection / AI-pick:** selecting a node (click or co-pilot) smoothly re-centers + zooms to it
  (animate the `ZoomableGroup` center/zoom). This also **removes the "globe keeps spinning after
  AI-pick" bug** — there is no globe to auto-rotate.
- **Connection line:** when connected, draw a line (great-circle-ish) from the user's location
  (`useUserLocation`, neutral fallback) to the selected node; animate/pulse it by traffic intensity.
- **Topojson bundled locally** in `apps/web/public/` (world-atlas 110m) — no CDN dependency
  (we already hit CDN reachability problems with the globe textures).

`page.tsx` keeps all existing state/handlers; only the `<GlobeMap>` element is swapped for
`<WorldMap>` with the same props shape (`nodes`, `selectedId`, `connected`, `streaming`, `onSelect`).

## 2. Bug fixes (rail)

- **Stop traffic must stop.** Today "Stop traffic" leaves the counter/settlements running until
  Disconnect. Diagnose with systematic-debugging (the `useTrafficStream` cleanup *looks* correct,
  so the real cause — in-flight `/api/browse` calls, the Counter SSE, or a state path — must be
  found, not guessed) and ensure toggling off halts byte generation and the live visuals.
- **Intensity selector fits the rail.** `light / medium / heavy` (`.seg` inside `.stream-controls`)
  is clipped ("Heavy" hidden). Restyle so all three segments fit (e.g. the segmented control on its
  own full-width row below the Stop button, equal-width segments).
- **Fix dark-on-dark text.** On the dark rail, the "STREAMING SPEND" value (in `Counter`) and the
  "ON-CHAIN SETTLEMENTS" eyebrow render dark-on-dark and are unreadable. Give them readable colors
  (light ink / muted-light) against the dark rail.

## 3. Agent form (`AgentRunForm`)

Remove the **`mock`** checkbox entirely (on the live site mock still settles real USDC, so it
misleads) and stop sending `mock` to `/api/agent/run`. Relabel the budget input to a visible
**"Max budget (USDC)"** with a default of `0.02` and a one-line hint (e.g. "The agent stops when
it has spent this much."). The route already caps budget server-side (`MAX_AGENT_BUDGET_USD`).

## 4. Agent page empty state

New visitors currently see a **stale example run**, because `app/agent/page.tsx` queries the
*latest* `agent_runs` row when there's no `?run=` param. Change it to load a run **only** when
`?run=<id>` is present; otherwise render the clean empty state (the form + an invitation like
"Launch an agent to watch it reason and pay per request"). Launching a run still navigates to
`/agent?run=<id>` and shows it.

## Testing

- **Unit (vitest):** the testable seams only — e.g. a pure helper for pan/zoom-to-node math or
  marker projection if extracted; the agent page's "no `run` param → empty state" branch; the
  form no longer renders a mock checkbox and posts no `mock`. Keep React-Testing-Library tests
  light (assert structure, not WebGL/SVG pixels).
- **Visual:** headless-Chrome screenshots of `/` (map at default + zoomed + connected) and `/agent`
  (empty + running), iterated with the frontend-design skill. The map is plain SVG, so unlike the
  WebGL globe it **will** capture in headless screenshots.
- **Manual (human):** the live MetaMask flow on the deployed site — connect, start/stop traffic,
  intensity, settlements readable, ArcScan link — since that needs a real wallet + IPv6 egress.

## Out of scope

Backend / settlement / deploy changes; multi-region nodes; the human CONNECT-proxy format; any
agent-reasoning changes. Pure front-end polish.
