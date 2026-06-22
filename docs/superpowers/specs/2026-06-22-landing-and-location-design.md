# Design — Landing page + reliable location flow (Layer 2.8)

**Date:** 2026-06-22
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

Two issues, one root cause.

1. **Geolocation bug.** On the map, "✦ Let AI pick for me" calls
   `navigator.geolocation.getCurrentPosition` *inline at click time* with a **4s
   timeout** ([apps/web/app/page.tsx](../../../apps/web/app/page.tsx) `copilotPick`).
   The first click races the browser permission prompt and a cold GPS fix: if the
   user takes >4s to approve, or the first fix is slow, the timeout fires and
   `resolve(null)` is called → the API
   ([apps/web/app/api/copilot/pick/route.ts](../../../apps/web/app/api/copilot/pick/route.ts))
   receives no location and falls back to the cheapest node (Mumbai, "unknown
   location"). A later click succeeds because the browser has cached a fix
   (Frankfurt, proximity-based). Net symptoms reported: user must re-click after
   approving, and the first resolved pick is wrong.

2. **No landing experience.** `/` is the raw map. There is no NordVPN-style entry:
   a marketing hero that, on "Start using", requests location and drops the user
   onto the map already zoomed to their location.

The fix is shared: **acquire location once, reliably, into a shared client store,
and never let a short timeout race the permission prompt.** "Start using" on the
landing becomes the natural moment to request it, so by the time the user reaches
the map and clicks AI-pick, coords are already resolved.

## Decisions (locked during brainstorming)

- **Structure:** dedicated landing at `/`; the map moves to its own route `/map`.
- **Landing scope:** hero only (tagline + one CTA + ambient animated backdrop).
- **No-location fallback:** gentle "pick manually" banner with Retry + Browse;
  AI-pick still works, falling back to cheapest node.
- **Sign-in:** "Start using" goes straight to the map; wallet sign-in stays in the
  nav and is required only at Connect.
- **Cross-route state:** a React **context** (lives in the root layout, survives
  client navigation). Rejected alternatives: `sessionStorage` (stale/serialization)
  and `?lat=&lng=` URL params (leaks coords, clumsy).

## Architecture

### Routing

| Route | Before | After |
|-------|--------|-------|
| `/` | World map app | **Landing** (new) |
| `/map` | — | World map app (current `app/page.tsx` moved here) |
| `/agent`, `/use-with-agent` | unchanged | unchanged |

- [components/SiteNav.tsx](../../../apps/web/components/SiteNav.tsx): "Map" link
  `/` → `/map`. Brand link stays `/` (landing). Nav remains global (shown on the
  landing too).

### Location store — `apps/web/lib/location.tsx` (new)

`LocationProvider` + `useLocation()` context, added inside
[app/providers.tsx](../../../apps/web/app/providers.tsx) so it is available app-wide
and persists across `/` → `/map` client navigation.

State shape:

```ts
type LocationStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable";
interface LocationContext {
  status: LocationStatus;
  coords: { lat: number; lng: number } | null;
  request(): Promise<{ status: LocationStatus; coords: {lat:number;lng:number} | null }>;
}
```

Behaviour of `request()`:

- Calls `getCurrentPosition` with a **generous timeout (~12s)** and a `maximumAge`
  (accept a recent cached fix). **Awaits a real result** — never resolves `null`
  at 4s.
- Success → `granted` + cached coords. Permission denial → `denied`. Missing
  `navigator.geolocation` or timeout → `unavailable`.
- **Dedupes** concurrent calls (returns the single in-flight promise) and caches
  granted coords, so a second click cannot produce a different answer.
- SSR-safe: client-only (`"use client"`), guards `typeof navigator`.

Removes: the inline `getCurrentPosition` in `copilotPick`, and
`apps/web/lib/use-user-location.ts` (folded into the context — confirm no other
importers first; if any exist, repoint them to `useLocation()`).

### Landing — `apps/web/app/page.tsx` (rewritten, hero only)

- Headline + subline (e.g. *"NanoVPN — the only pay-per-use VPN. Settled in USDC,
  on Arc."*), one glowing **"Start using"** CTA.
- **Backdrop:** new thin `apps/web/components/MapBackdrop.tsx` reusing
  `public/world-110m.json` + the same d3-geo projection — non-interactive, slow
  drift, pulsing node pins. Kept separate from the interactive `WorldMap` so that
  component stays focused on the app.
- **"Start using"** → `location.request()`; button shows "Locating…"; then
  `router.push("/map")` once location settles, with a **~6s safety cap** so a
  stuck prompt never blocks navigation (deny/timeout still proceeds — the map
  handles it).
- Visual treatment follows frontend-design principles (applied during
  implementation).

### Map — `apps/web/app/map/page.tsx` (moved from `app/page.tsx`)

- Reads `useLocation()`.
- **Arrival view:** `granted` → initial view centered on the user at zoom **k≈3**
  with a "You are here" marker; otherwise whole-world (k=1).
- **AI-pick:** `copilotPick()` reads coords from context (awaiting the in-flight
  request if still `prompting`), then calls `/api/copilot/pick`. Result: **no
  double-click, accurate on the first click.** Existing fly-to-selection animation
  still moves the map to the chosen node.
- **Denied/unavailable:** gentle banner — *"Location off — pick a node on the map,
  or enable location & retry"* with **Retry** (re-calls `request()`) and **Browse**.
- **Deep link to `/map`** with no prior landing visit (`status === "idle"`) →
  request location on mount.

### WorldMap — `apps/web/components/WorldMap.tsx`

- New optional prop `userLocation?: { lat: number; lng: number } | null` → renders
  a "You are here" marker and supports an initial centered view derived from it
  (reusing existing `viewCenteredOn` from `lib/map-view.ts`).
- `MIN_K` / `viewCenteredOn` / `pinPositions` and the selection fly-to effect are
  unchanged.

## Data flow

```
Landing "Start using"
  → location.request()            (context; ~12s timeout, dedup, cache)
  → status settles (granted|denied|unavailable)
  → router.push("/map")
Map mount
  → useLocation(): granted? center on coords @k≈3 + "You are here"
                   else        whole-world + manual-pick banner
"Let AI pick for me"
  → coords from context (await in-flight if prompting)
  → POST /api/copilot/pick { lat?, lng? }
  → setSelected(nodeId) → WorldMap flies to node
```

## Error handling

| Case | Result |
|------|--------|
| `navigator.geolocation` missing | `status = unavailable`; manual-pick banner; AI-pick → cheapest |
| User denies permission | `status = denied`; manual-pick banner; Retry available |
| Slow fix / >12s | `status = unavailable`; never resolves `null` early; Retry available |
| Concurrent `request()` calls | deduped to one in-flight promise |
| SSR / no `navigator` | guarded; no throw |
| "Start using" prompt stuck | ~6s safety cap → navigate anyway, map shows banner |

## Testing

vitest + @testing-library (matching `apps/web/test/world-map.test.tsx`), mocking
`navigator.geolocation`:

- Location state machine: grant → `granted` + coords; deny → `denied`; timeout →
  `unavailable`; concurrent calls deduped to one underlying `getCurrentPosition`.
- Map computes a centered initial view from supplied coords (vs. world view when
  none).
- `copilotPick` uses context coords and does **not** call `getCurrentPosition`
  inline.
- Landing "Start using" triggers `request()` then navigates (mock `router.push`).

## Out of scope

On-chain/settlement path, agent routes (`/agent`, `/api/agent/*`), node pricing,
and the deterministic `pickNodeDeterministic` logic (unchanged — it already handles
a null location).

## Files touched

- `apps/web/app/page.tsx` — becomes the landing (rewritten)
- `apps/web/app/map/page.tsx` — new (current map content moved here)
- `apps/web/lib/location.tsx` — new (LocationProvider + useLocation)
- `apps/web/components/MapBackdrop.tsx` — new (landing animated backdrop)
- `apps/web/app/providers.tsx` — wrap with LocationProvider
- `apps/web/components/SiteNav.tsx` — "Map" link → `/map`
- `apps/web/components/WorldMap.tsx` — `userLocation` prop + initial centering + marker
- `apps/web/components/MapRail.tsx` — manual-pick banner (denied/unavailable)
- `apps/web/lib/use-user-location.ts` — removed (folded into context)
- `apps/web/app/globals.css` — landing hero + backdrop + banner styles
- `apps/web/test/*` — new tests per above
```
