# NanoVPN UX Overhaul v2 (Layer 2.6) — Design Spec

> Status: **approved** (brainstorming 2026-06-20). Supersedes the visual direction of
> the first overhaul ([2026-06-19-ux-overhaul-design.md](2026-06-19-ux-overhaul-design.md)).
> Next step: `superpowers:writing-plans`.

## 1. Why

The first overhaul shipped a working globe, run-from-web, `/developers`, and shared nav
— but live review found three problems:

1. **Map** reads too dark (`earth-dark.jpg` — can't tell ocean from land), wastes page
   space, puts the wallet in the wrong place, and settlement rows don't link anywhere.
2. **`/agent`** has no clear purpose and the UI is unstructured.
3. **`/developers`** is mislabeled (it's an *agent* onboarding prompt, not a dev portal)
   and visually rough.

Plus a real bug: the from-web agent run 500s with *"Cannot read properties of undefined
(reading 'slice')"*.

This overhaul sharpens each page's purpose and rebuilds its UI, makes the agent's
node-selection genuinely agentic, and wires real block-explorer links — without
re-architecting the working core (proxy, x402, settlement, Supabase realtime).

## 2. Decisions locked (from brainstorming)

| # | Decision |
|---|---|
| D1 | **`/agent` = autonomous-agent showcase**, AND a lightweight **"Let AI pick for me" co-pilot** button on the map (shared buyer-brain). |
| D2 | **`/developers` → `/use-with-agent`** ("Use with your agent" onboarding); `/developers` 308-redirects to it. |
| D3 | **Map layout A:** full-bleed globe + translucent right glass rail; **wallet moves to the header** (top-right). |
| D4 | **Agent layout A:** reasoning timeline + status rail (mini globe with chosen node, budget gauge, payments, result). |
| D5 | **Onboarding layout A:** centered quickstart (copy-prompt → code → endpoint reference → doc links). |
| D6 | **The agent genuinely picks the node** — selects by goal+price, `payRequest` routes to that node's `/egress`, the run records the real pick. |
| D7 | **Globe:** stay on `react-globe.gl`; fix "too dark" with `earth-blue-marble` texture + topology bump + brighter lights + neon-green atmosphere. |
| D8 | **Co-pilot pick:** one quick Claude call `{nodeId, reason}` from geolocation + node list, with a deterministic nearest-cheapest fallback when no API key. |
| D9 | **ArcScan links:** best-effort enrich the on-chain tx hash from the facilitator transfer record; link `arcscan/tx/{hash}` when known, else `arcscan/address/{seller}`. Never link raw facilitator JSON. |

## 3. Information architecture & shared shell

Three pages; nav relabeled **Map · Agent · Use with agent**.

- `apps/web/components/SiteNav.tsx` — relabel "Developers" → "Use with agent" (`/use-with-agent`).
  **Move the wallet control into the nav, top-right**: a `WalletButton` showing
  `Connect wallet` → after SIWE, the short address + a disconnect menu. SIWE logic
  (currently in `ConnectBar`) is lifted into this header control so it's present on every
  page. The map's right rail no longer owns wallet state.
- `apps/web/app/developers/` → renamed to `apps/web/app/use-with-agent/`. Add
  `apps/web/app/developers/route.ts` (or `next.config` redirect) issuing a permanent
  redirect to `/use-with-agent`.
- Theme unchanged (light app chrome, USDC-green); the map becomes an immersive dark globe
  stage with a light header and translucent overlays.

## 4. Map page (`/`) — full-bleed globe + right glass rail

### 4.1 GlobeMap (`apps/web/components/GlobeMap.tsx`)
Apply the research-verified config:

```
globeImageUrl     = ".../earth-blue-marble.jpg"   // legible land/ocean
bumpImageUrl      = ".../earth-topology.png"
backgroundImageUrl= ".../night-sky.png"
showAtmosphere atmosphereColor="#39ff14" atmosphereAltitude={0.18}
// after mount, via ref:
globeMaterial().bumpScale = 10; globeMaterial().shininess = 15
controls().autoRotate = true; autoRotateSpeed = 0.4
```

- **Glowing pins** via `htmlElementsData` (CSS `box-shadow` glow; bolder + clickable).
- **Animated traffic arcs** (`arcsData`) from the user's geolocation → selected node,
  `arcDashAnimateTime` while streaming; **pulsing rings** (`ringsData`) on the connected
  node. Arc/ring intensity scales with the existing `Intensity` (low/med/high) from
  `lib/traffic.ts`.
- Keep the ResizeObserver containment from commit `af6abf0`. Fill the stage (header height
  → 100% of remaining viewport).
- Props unchanged in spirit: `{ nodes, selectedId, connected, streaming, userLoc, onSelect }`.

### 4.2 Right glass rail (`apps/web/app/page.tsx` + a `MapRail` component)
Translucent (`backdrop-filter: blur`) panel, top-right over the globe:
- **Exit node** card (selected node: city, country, `$/GB`).
- **Connect / Disconnect** (gated on SIWE; if not signed in, prompt via the header wallet).
- **Live spend** counter (existing `Counter`, µUSD → USDC) once connected + streaming.
- **Settlement tape** (existing `SettlementLog`, restyled) — each row links to ArcScan (§7).
- **"✦ Let AI pick for me"** button at the base (§5).

### 4.3 Seed nodes — `supabase/migrations/0003_more_nodes.sql`
Add 6 nodes (total 9) with **differentiated** `price_per_request_usd` / `price_per_gb_usd`
so "cheapest" is a real decision. All `proxy_url`/`settle_url` point at the existing
single proxy host for the MVP (documented caveat — egress IP is identical until
multi-region deploy). Suggested set + rough prices:

| id | city | lat,lng | $/req | $/GB |
|----|------|---------|-------|------|
| tokyo-1 (exists) | Tokyo | 35.68,139.65 | 0.0010 | 1.8 |
| singapore-1 | Singapore | 1.35,103.82 | 0.0012 | 2.0 |
| mumbai-1 | Mumbai | 19.08,72.88 | 0.0008 | 1.4 |
| frankfurt-1 (exists) | Frankfurt | 50.11,8.68 | 0.0011 | 1.9 |
| london-1 | London | 51.51,-0.13 | 0.0013 | 2.2 |
| nyc-1 (exists) | New York | 40.71,-74.01 | 0.0014 | 2.4 |
| toronto-1 | Toronto | 43.65,-79.38 | 0.0012 | 2.0 |
| sao-paulo-1 | São Paulo | -23.55,-46.63 | 0.0009 | 1.6 |
| sydney-1 | Sydney | -33.87,151.21 | 0.0015 | 2.6 |

(Exact prices are a tuning knob; the point is spread + geographic coverage.)

## 5. Co-pilot — "Let AI pick for me"

- New route `apps/web/app/api/copilot/pick/route.ts` (`POST {lat,lng}`):
  reads the node list, makes a **single thin Anthropic completion** (NOT the tool-loop —
  just one message asking for the best node given the user's location + the node list +
  budget sensitivity), parsing a strict JSON `{ nodeId, reason }`. Validate `nodeId`
  against the node list; on any parse/validation failure, use the fallback.
- **Deterministic fallback** (no `ANTHROPIC_API_KEY`, or on error/timeout): nearest node
  by haversine, tie-broken by cheapest `$/GB`. Pure function `pickNodeDeterministic(loc, nodes)`
  in `apps/web/lib/copilot.ts` (unit-tested).
- On the map: clicking the button calls the route, then **auto-selects the returned node,
  shows the one-line `reason`** in the rail, and triggers Connect. No payments — this only
  chooses + connects the human session.

## 6. Agent showcase (`/agent`) — genuine node selection

### 6.1 Form (`apps/web/components/AgentRunForm.tsx`)
Goal (text) + budget (USD) + **mock** toggle. **Remove the node dropdown.**
`POST /api/agent/run` body becomes `{ goal, budgetUsd, mock }` (no `nodeId`).

### 6.2 Backend node selection (`apps/agent/src`)
- `prepareRun` no longer takes `nodeId`. It builds executors with a `nodesReader` and a
  **node-aware `payRequest`**.
- Tools (`tools.ts`, `run.ts` system prompt, `TOOL_DEFS`): `payRequest` gains a required
  `nodeId` — `payRequest({ nodeId, url })`. The executor resolves `nodeId → proxy_url →
  ${proxy_url}/egress` and pays there. `listNodes` returns id/city/country/price so the
  brain can compare. The **system prompt** instructs: compare nodes by goal region + price,
  pick one, justify, then call `payRequest` with that `nodeId`.
- **Recording the pick:** `agent_runs.node_id` becomes nullable at `startRun` and is set
  (UPDATE the row) on the **first `payRequest`** — that is the agent's committed choice. No
  separate `selectNode` tool. The status rail reads the chosen node from the run row.
- Guardrails unchanged (budget enforced before each pay; price taken from the chosen node).

### 6.3 View (`apps/web/app/agent/page.tsx` + `AgentFeed`/new `AgentStatusRail`)
- **Timeline** (`AgentFeed`, restyled): THINK / TOOL / PAY chips streaming via Supabase realtime.
- **Status rail** (new `AgentStatusRail`): mini `GlobeMap` (reused, non-interactive) with the
  chosen node lit + others dimmed; budget gauge (spent/budget); payments list (amount · status
  · bytes · egress IP · ArcScan link); result card on completion.
- Run-context header (goal, status badge) retained, restyled.

### 6.4 Bug fix
- Confirmed root cause of the 500: `apps/web/.env.local` lacked `BUYER_PRIVATE_KEY`, so
  `new GatewayClient({ privateKey: undefined })` threw inside viem. **Env already added.**
- Add a **guard** in `prepareRun`: if `!process.env.BUYER_PRIVATE_KEY` (and not mock),
  throw `"BUYER_PRIVATE_KEY not configured"` — a readable 500, not a viem crash.

## 7. ArcScan links (`packages/core` + settle paths)

The facilitator returns a **settlement UUID** in `transaction`, not an on-chain hash.

- **Enrichment (best-effort):** after a successful `settle`, GET the facilitator transfer
  record `${ARC.facilitator}/v1/x402/transfers/{uuid}` and read the on-chain tx hash if
  present; store it in `settlements.tx_hash` (human) and include `tx_hash` in the agent
  `payment` event payload (no schema migration if `agent_events` stores event data as JSON —
  the plan confirms the column shape). Bounded timeout, never blocks settlement, swallow errors.
- **Link builder** in `packages/core/src/chain.ts`:
  `settlementUrl({ txHash, sellerAddress }) → txHash ? explorerTx(txHash) : explorerAddr(sellerAddress)`.
  Always resolves to ArcScan. `sellerAddress` = the node's `operator_address` (fallback: payer).
- `SettlementLog` (human) and the agent payments list both use this builder.

## 8. Components & files touched

**New:** `app/use-with-agent/page.tsx`, `app/developers/route.ts` (redirect),
`app/api/copilot/pick/route.ts`, `lib/copilot.ts`, `components/MapRail.tsx`,
`components/WalletButton.tsx`, `components/AgentStatusRail.tsx`,
`supabase/migrations/0003_more_nodes.sql`.

**Changed:** `components/SiteNav.tsx`, `components/GlobeMap.tsx`, `components/AgentRunForm.tsx`,
`components/AgentFeed.tsx`, `components/SettlementLog.tsx`, `components/ConnectBar.tsx`
(wallet logic lifted out), `app/page.tsx`, `app/agent/page.tsx`,
`api/agent/run/route.ts` (drop nodeId), `packages/core/src/chain.ts`,
`apps/agent/src/{runner,tools,run,events}.ts`, `apps/agent/src/index.ts` (CLI `--node`
becomes **optional**: omit → the agent picks; pass → constrains/pre-seeds the choice),
edge-node settle/egress (tx-hash enrichment hook).

**Deleted:** `app/developers/page.tsx` (replaced by use-with-agent + redirect).

## 9. Data flow (unchanged spine)

- Human: SIWE (header) → select node (or co-pilot) → Connect → CONNECT proxy meters bytes
  → streaming settlement loop → `settlements` rows (now tx-hash-enriched) → realtime → rail.
- Agent: `POST /api/agent/run {goal,budget,mock}` → `prepareRun` → `after()` runs the loop →
  brain compares nodes → `payRequest({nodeId,url})` → node `/egress` (402 → sign → fetch →
  settle) → `agent_events` (reasoning/tool/payment) → realtime → `/agent` timeline + rail.

## 10. Testing

- **Unit (TDD):** `pickNodeDeterministic` (haversine + cheapest tiebreak); `settlementUrl`
  builder (hash vs address fallback); node-aware `payRequest` executor (resolves nodeId →
  egress, pays correct node, records pick); `prepareRun` guard (missing key throws clearly);
  `prepareRun` no-nodeId signature; copilot route (mock brain → `{nodeId,reason}`, fallback
  path). Keep all 75 existing tests green.
- **Visual:** headless-Chrome screenshot loop for `/`, `/agent`, `/use-with-agent` (use
  `frontend-design` for polish) — don't iterate UI blind.
- **Live:** re-run Step 4 from-web agent run (real Claude now that the key is in the web
  env); human map flow (SIWE in header → co-pilot pick → connect → traffic → ArcScan link
  resolves); confirm `agent_runs.node_id` = the agent's real pick.

## 11. Out of scope (unchanged)

Real multi-region egress (nodes still share one proxy host), ERC-8004 / on-chain identity,
Fly/Vercel deploy. These remain post-hackathon / Layer 3.

## 12. Open questions

None — all resolved in brainstorming (D1–D9).
