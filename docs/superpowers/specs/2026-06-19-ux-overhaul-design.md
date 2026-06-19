# NanoVPN UX/UI Overhaul (Layer 2.5) — Design Spec

> Status: **Design — approved direction (2026-06-19), pending written-spec review** ·
> Phase: post-brainstorming, pre-`writing-plans`. Extends Layer 1 (human map) + Layer 2
> (agent). All work is in `apps/web` plus a small DRY refactor in `apps/agent`.

## 1. Purpose

Layers 1 and 2 are functionally complete and live-verified, but the **UX/UI is not
demo-grade**. This overhaul makes both front doors feel real and premium:

- **Human view:** a flat static map → an **immersive 3D globe**; a dead-end "connected"
  state → **disconnect**; a fake-feeling "Send traffic" button → **continuous auto-streamed
  traffic** so USDC payments visibly flow.
- **Agent view:** terminal-only runs → **launch a run from the web**; and a discoverable
  **"Use with your agent"** on-ramping page with a paste-able prompt.

## 2. Goals & non-goals

**Goals**
1. Replace the 2D map with an interactive 3D globe (pan/zoom/spin, glowing node points,
   click-to-select, connection arc + animated rings when connected).
2. Add a **Disconnect** control (backend already exists) and unlock re-selection after it.
3. Replace manual "Send traffic" with a **Stream toggle + intensity (Light/Medium/Heavy)**
   that drives continuous real bytes through the node, so the counter + settlements stream.
4. Add an **in-app "Run agent" form** on `/agent` that triggers a server-side run and
   streams it live into the existing panel.
5. Add a **`/developers` ("Use with your agent")** page: a copy-paste agent prompt +
   endpoint/funding details, building on the served `/agent-onboarding` + `/llms.txt`.

**Non-goals**
- Metering the user's *real* OS/browser traffic (a web app can't transparently do this;
  the proxy supports it for power users out-of-band, documented on `/developers`).
- Standing up genuinely separate regional proxy hosts (seed nodes still share one proxy).
- ERC-8004 / on-chain identity (Layer 3).

## 3. Decisions locked (from brainstorming, 2026-06-19)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Map | **3D interactive globe** via `react-globe.gl` (2D-immersive fallback if it proves too heavy) |
| 2 | Traffic | **Auto-stream + intensity** (generated load through the node; not OS traffic) |
| 3 | Run agent from web | **Yes — in-app run form**, runs in-process server-side |
| 4 | Agent on-ramping | **Dedicated `/developers` page** with paste-able prompt |

## 4. Components

### 4.1 `GlobeMap` — interactive 3D globe (NEW, replaces `WorldMap`)
- **What:** client-only React component rendering an interactive globe of the node network.
- **Library:** `react-globe.gl` (three.js/globe.gl wrapper). **Must** be loaded via
  `next/dynamic` with `{ ssr: false }` (WebGL has no SSR).
- **Interface:** `<GlobeMap nodes selectedId connected streaming onSelect />` where
  `streaming` ∈ `null | "light" | "medium" | "heavy"`.
- **Behavior:**
  - `pointsData = nodes` → glowing/pulsing points at each `geo.lat/lng`; label shows
    `city · $rate`.
  - Auto-rotates until first user interaction; **drag to spin, scroll to zoom/pan**.
  - `onPointClick` → `onSelect(nodeId)`; camera smoothly flies to the node
    (`pointOfView`).
  - When `connected`: the selected node shows animated **rings** (`ringsData`) and an
    **arc** (`arcsData`) from a best-effort "you" origin (see `useUserLocation`) to the
    node; ring repeat-period shortens as `streaming` intensity rises.
  - Dark theme + atmosphere glow on the existing USDC-green tokens; visual styling refined
    via **frontend-design** + a screenshot loop at implementation.
- **Depends on:** `react-globe.gl`, `NodeListing` from core, `useUserLocation`.
- **Fallback:** if `react-globe.gl` is incompatible (React 19 / Next 16) or too heavy, fall
  back to an immersive pannable-2D map; the component interface stays identical so nothing
  else changes.

### 4.2 `useUserLocation` (NEW hook)
- **What:** best-effort `{ lat, lng }` for the arc origin. Tries `navigator.geolocation`
  (permission); on denial/unavailable, returns a neutral fallback (e.g. `{0, 20}`).
  Never blocks render; arc simply doesn't draw until/unless a location resolves.

### 4.3 Connected-state controls in `page.tsx` (MODIFY)
- **Disconnect:** button in the connected panel → `DELETE /api/session?id=<sessionId>` →
  reset `session`/`selected`, stop streaming, re-enable globe selection. (Route exists.)
- **Stream toggle + intensity:** replaces the "Send traffic" button. A toggle plus a
  Light/Medium/Heavy selector drives `useTrafficStream`.

### 4.4 `useTrafficStream` (NEW hook)
- **Interface:** `useTrafficStream(sessionId: string | null, intensity, enabled: boolean)`.
- **Behavior:** when `enabled` + `sessionId`, repeatedly `fetch('/api/browse?session=…')`
  on an interval from a pure `intervalForIntensity(intensity)` map
  (Light ≈ 3000ms, Medium ≈ 1200ms, Heavy ≈ 400ms — tunable). Soft-fails per call (browse
  already soft-fails). Cleans up the interval on disable/unmount/disconnect. The existing
  `Counter` (SSE) + `SettlementLog` (realtime) reflect the streamed spend automatically.
- **Unit-testable seam:** `intervalForIntensity` is a pure exported function (tested);
  the hook wires it to `setInterval`.

### 4.5 Agent run-from-web (NEW route + form + agent refactor)
- **Agent refactor (DRY):** extract the run-wiring from `apps/agent/src/index.ts` into
  `apps/agent/src/runner.ts`:
  ```ts
  export async function prepareRun(params: {
    goal: string; budgetUsd: number; nodeId: string; mock: boolean;
  }): Promise<{ runId: string; run: () => Promise<{ status: string; result: string }> }>;
  ```
  `prepareRun` resolves the node, builds buyer/executors/guardrails/brain, and **inserts
  the `agent_runs` row now** (via `startRun`), returning `runId` immediately + a `run()`
  thunk that executes the loop. Both the CLI (`index.ts`) and the web route use it — the
  CLI does `const {run} = await prepareRun(...); await run()`.
- **Web route `POST /api/agent/run` (NEW):** validates `{ goal, budgetUsd, nodeId, mock }`,
  calls `prepareRun`, kicks off `run()` via `after()` (survives the response; fits function
  limits since runs are seconds), and returns `{ runId }`. Requires `BUYER_PRIVATE_KEY` +
  `ANTHROPIC_API_KEY` + Supabase keys in the web process env (`apps/web/.env.local`).
- **`AgentRunForm` (NEW client component on `/agent`):** goal, budget (default 0.02), node
  select, optional "mock" → POST → `router.push('/agent?run=' + runId)`. The existing panel
  streams it live via realtime.
- **Dep:** `apps/web` adds `@nanovpn/agent` (`workspace:*`).

### 4.6 `/developers` — "Use with your agent" page (NEW)
- **What:** a polished page with (a) a one-paragraph pitch, (b) a **copy-paste prompt** —
  a system-prompt snippet a user drops into *their* agent to teach it to buy NanoVPN egress
  via x402, (c) the **endpoint / payment / funding** facts, and (d) copy buttons. Builds on
  the served `/agent-onboarding` (markdown) + `/llms.txt`.
- **Prompt content** lives in one module (`apps/web/lib/agent-prompt.ts`) reused by the page
  and (optionally) the served `/agent-onboarding` doc so they can't drift.
- **`CopyButton` (NEW small client component).**

### 4.7 Shared nav (MODIFY `layout.tsx`)
- A minimal top nav linking **Map (`/`) · Agent (`/agent`) · Developers (`/developers`)**
  so the three surfaces are discoverable. Styled with existing tokens.

## 5. Data flow

- **Human connect→stream→disconnect:** select node (globe) → Connect (`POST /api/session`)
  → toggle Stream → `useTrafficStream` pulls `/api/browse` on interval → bytes metered on
  the node → `Counter` (SSE) ticks, `SettlementLog` (realtime) posts, globe rings pulse →
  Disconnect (`DELETE /api/session`) → reset.
- **Agent from web:** `AgentRunForm` → `POST /api/agent/run` → `prepareRun` inserts run row
  + returns `runId` → `after(run())` executes the loop, writing `agent_events` → client
  navigates to `/agent?run=runId` → panel streams via realtime (already built).

## 6. Error handling

- Globe: if the WebGL component fails to load, render the 2D fallback (or a static node
  list) — never a blank stage.
- Geolocation denied/unavailable → no arc origin; globe still fully works.
- `/api/browse` per-call failure → already soft-fails; the stream loop continues.
- `/api/agent/run`: validate inputs (non-empty goal, budget > 0, known node) → 400 on bad
  input; 500 with a message if `prepareRun` throws (e.g. missing env). Surface failures in
  the form.
- A failed/again-running edge-node: the run records an `error` event (already handled);
  the panel shows it.

## 7. Testing

- **Unit:** `intervalForIntensity` (intensity→ms); `/api/agent/run` route (input
  validation + calls a faked `prepareRun` + returns runId); `runner.prepareRun` (fake db +
  mock brain → inserts row, returns runId + run thunk); `/developers` + agent-prompt module
  (contains the egress endpoint + payment facts); disconnect resets state.
- **Visual (screenshot loop, no unit test):** the globe and the `/developers` page, via the
  headless-Chrome loop used for `/agent`.
- Keep the existing 65 tests green.

## 8. Verify-at-planning flags

1. **`react-globe.gl` + React 19 / Next 16:** confirm the current version mounts under
   React 19 with `dynamic(..., {ssr:false})`; confirm exact prop names used
   (`pointsData/pointLat/pointLng/ringsData/arcsData/pointOfView`). If incompatible → 2D
   fallback.
2. **`after()` for the agent run:** confirm `next/server`'s `after()` runs the deferred
   loop both in `next dev` and when deployed (Vercel keeps the function alive). If not,
   fall back to awaiting the run in the route (runs are seconds).
3. **Web env:** `BUYER_PRIVATE_KEY` + `ANTHROPIC_API_KEY` must be added to
   `apps/web/.env.local` for `/api/agent/run` (gitignored). Without `ANTHROPIC_API_KEY`,
   the run falls back to mock mode (still settles real USDC).
4. **Browse intensity vs balance:** Heavy streaming spends faster — ensure the demo
   session budget is sized so a short demo doesn't exhaust it unexpectedly (or surface a
   "balance low" state).

## 9. Out of scope (restated)

Real OS/browser traffic metering · genuinely separate regional proxy hosts · ERC-8004 /
on-chain identity (Layer 3) · launch-from-web for the *human* proxy (agent only).
