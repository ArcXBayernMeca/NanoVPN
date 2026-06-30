# Design — Real multi-region egress (Plan 3)

**Date:** 2026-06-30
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

The map shows 9 nodes in 9 cities, but **all 9 rows point at one Fly box in Tokyo**
(`proxy_url = https://nanovpn-edge.fly.dev`, `primary_region = nrt`). The displayed
geo is the node's *claimed* city (`apps/web/app/api/egress/route.ts` returns
`geo` from the node's DB row), while the real egress IP is always Tokyo's. So picking
"Frankfurt" does not egress from Frankfurt — the last facade. Plan 3 makes every node
**genuinely egress from its real city** so the claim and the real egress IP match.

Two facts make this cheap, discovered during brainstorming:

1. **The product path is HTTP `POST /egress` only** (human streaming loop and the agent
   both call `/egress`). The raw HTTP-CONNECT proxy survives only in the orphaned
   `apps/web/app/api/browse/route.ts`, not the live flow. So per-region egress no longer
   needs the dedicated IPv4 + raw-TCP service — plain HTTPS over Fly's shared anycast is
   enough, which removes the $2/mo-per-region charge.
2. **Each edge-node machine resolves its own outbound IP at boot** (ipify, cached in
   `EGRESS_IP`) and returns it as the egress proof. A machine in `fra` therefore proves
   Frankfurt egress automatically — no per-region config needed for the proof.

## Decisions (locked during brainstorming)

- **All 9 cities become real**, via **one multi-region Fly app** (not separate apps),
  **scale-to-zero** (`min_machines_running = 0`, autostart on demand). Idle cost ≈ $0.
- **Fast-boot bundle:** replace runtime `tsx` with a precompiled `node dist/index.js` so a
  sleeping region wakes in seconds, not ~2 min — the prerequisite for usable scale-to-zero.
- **Routing = Fly-Prefer-Region + deterministic fly-replay.** The web sends the target Fly
  region; the node enforces it (replays if it landed in the wrong region) so "pick Frankfurt
  = really Frankfurt" every time.
- **No DB migration.** `proxy_url` stays the single app domain for every node; the
  node→region map lives in `packages/core`. The region is chosen per request by routing.
- **Honest by construction.** The node returns its real `FLY_REGION`; the UI shows a
  `✓ verified · <city>` badge only when the actual region matches the pick; otherwise it
  shows the *actual* region with no badge — never a false claim.

## Node → Fly region map

All 9 seeded node ids map cleanly to existing Fly regions:

| node id | city | Fly region |
|---|---|---|
| `tokyo-1` | Tokyo | `nrt` |
| `frankfurt-1` | Frankfurt | `fra` |
| `nyc-1` | New York | `ewr` |
| `singapore-1` | Singapore | `sin` |
| `mumbai-1` | Mumbai | `bom` |
| `london-1` | London | `lhr` |
| `toronto-1` | Toronto | `yyz` |
| `sao-paulo-1` | São Paulo | `gru` |
| `sydney-1` | Sydney | `syd` |

## Architecture

### A. `packages/core` — region map (shared)

- `NODE_REGION: Record<string, string>` — the table above (node id → Fly region code),
  consumed by both the web `/api/egress` route and the agent tools.
- `FLY_REGION_CITY: Record<string, string>` — Fly region code → display city (e.g.
  `fra → "Frankfurt"`), for the verified badge / honest actual-region display.

### B. Edge-node (`apps/edge-node`)

**Fast-boot build.** Add an esbuild bundle step: `src/index.ts → dist/index.js`
(`--bundle --platform=node --format=esm`), with native/optional deps that don't bundle
cleanly (`bufferutil`, `utf-8-validate`) marked external. The Dockerfile builds the bundle
and the container runs `node dist/index.js`. Target cold boot **< 5s**. The existing
`start` script (`tsx src/index.ts`) is kept for local dev. If esbuild bundling proves
fiddly with a dependency, the fallback is a plain `tsc`/esbuild **transpile-to-JS** (no
single-file bundle) run by `node` with `node_modules` present — the goal is only to take
`tsx` off the boot path.

**Region enforce + report** (`apps/edge-node/src/index.ts`, top of the `/egress` handler,
before any x402 work):

```
const want = req.headers['x-nanovpn-region'];          // e.g. "fra"
const have = process.env.FLY_REGION;                   // Fly sets this per machine
if (want && have && want !== have && !req.headers['fly-replay-src']) {
  res.writeHead(204, { 'fly-replay': `region=${want}` }).end();   // Fly re-routes + wakes target
  return;
}
// ...existing verify → fetch → settle...
// add `region: have` to the JSON response alongside egressIp
```

- `fly-replay` is consumed by Fly's proxy, not the client — the x402 client is oblivious
  and simply receives the eventual response from the target region. The `/egress` body is
  empty (URL is in the query string), so it is well under Fly's replay body limit.
- The `fly-replay-src` guard prevents any replay loop; the target machine has
  `have === want` and processes normally regardless.
- **Pricing must be identical across regions.** A replayed request carries the same signed
  x402 payment, re-validated by the target region against the price *it* computes. So
  `EDGE_NODE_PRICE_PER_GB_USD` / `EDGE_NODE_PRICE_PER_REQUEST_USD` (and `SELLER_ADDRESS`)
  must be **app-level** env/secrets — set once for the app, identical on every machine.
  Do not set per-region pricing.

**fly.toml** (repo root): replace the raw-TCP `[[services]]` (TLS pass-through for CONNECT)
with an HTTP service so Fly-Prefer-Region, fly-replay, and autostart work:

```toml
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
```

This retires CONNECT at the Fly edge — acceptable because the only consumer is the orphaned
`api/browse`. Drop the dedicated IPv4 (`fly ips release`) — the HTTP service uses Fly's
shared anycast IPs; the `nanovpn-edge.fly.dev` hostname is unchanged. Try **256 MB** RAM
(the 1 GB requirement was a `tsx`-OOM workaround; precompiled `node` should fit 256 MB —
verify on deploy and bump if needed).

### C. Web `/api/egress` (`apps/web/app/api/egress/route.ts`)

- `const region = NODE_REGION[nodeId]` (404 already handles unknown node; an unmapped but
  known node id is treated as "no preference" — see Error handling).
- Pass headers to `buyer.pay`:
  `{ method: "POST", headers: { "fly-prefer-region": region, "x-nanovpn-region": region } }`.
- The node response now includes `region` (actual `FLY_REGION`). Return it plus
  `regionVerified = (res.data.region === region)` in the JSON, alongside the existing
  `egressIp`, `bytes`, `transaction`, `amountMicroUsd`, `geo`.
- Everything else (auth 401, `ensureProvisionedAndFunded` 503 cap-gate, per-user
  `GatewayClient` signing, `settlements` insert) is unchanged.

### D. Agent tools (`apps/agent/src/tools.ts`)

The agent's `buyer.pay(`${node.proxy_url}/egress?url=…`, { method: "POST" })` gains the
same two headers, mapped from the picked node's id via `NODE_REGION` — so agent egress is
region-real too. (`nodesReader` already selects `id`.)

### E. UI (`apps/web/components/FetchPanel.tsx`)

The egress line shows the real egress IP and a **`✓ verified · <city>`** badge when the
tick's `regionVerified` is true. When false, show the actual region's city (from
`FLY_REGION_CITY[region]`) with **no** badge — honest, never a false claim. No new design
language; reuse the existing dark-rail styles.

## Data flow

```
pick Frankfurt → POST /api/egress {nodeId:"frankfurt-1", stream:true}
  → region = NODE_REGION["frankfurt-1"] = "fra"
  → buyer.pay(node/egress?url=<chunk>&meterBytes=…,
              headers:{fly-prefer-region:fra, x-nanovpn-region:fra})
       Fly lands on fra directly (Prefer-Region) OR lands elsewhere
         → that node returns 204 fly-replay:region=fra → Fly routes+wakes fra
       fra node: FLY_REGION==fra ✓ → verify → fetch chunk → settle (Gateway)
                 → {status, bytes, egressIp:<fra IP>, region:"fra", transaction}
  → web: regionVerified = true; insert settlements row (payer=user EOA)
       → return {sessionId, bytes, egressIp, region:"fra", regionVerified:true, …}
  → UI: "✓ egress verified · Frankfurt" beside the real fra IP; counter/tape as today
```

## Error handling

| Case | Result |
|---|---|
| Target region cold (scaled to zero) | autostart wakes it (~1–5s via fast-boot); later ticks hit it warm |
| Fly-Prefer-Region lands elsewhere | node `fly-replay: region=<target>` forces the correct region (deterministic) |
| Region unreachable / replay capped | request served by the landed region; response `region` ≠ expected → `regionVerified=false` → UI shows actual region, no ✓ |
| Node id known but unmapped in `NODE_REGION` | no region headers sent (no preference); Fly serves nearest; `regionVerified=false`; honest actual-region display |
| `FLY_REGION` unset (local dev) | node skips enforcement; behaves exactly as today |
| Not signed in / grant-capped | unchanged (401 / 503) — region logic runs only after those gates pass |

## Testing

vitest:

- **core:** `NODE_REGION` has an entry for every one of the 9 seeded node ids and each maps
  to a non-empty Fly region; `FLY_REGION_CITY` covers every region used.
- **edge-node:** `/egress` with `x-nanovpn-region` ≠ `FLY_REGION` → 204 + `fly-replay`
  header, no payment/fetch; with a matching (or absent) region → normal flow and `region`
  present in the response body. (Set `process.env.FLY_REGION` in the test.)
- **web `/api/egress`:** stream + non-stream send both `fly-prefer-region` and
  `x-nanovpn-region` headers derived from `NODE_REGION[nodeId]`; the response carries
  `region` and a correct `regionVerified`; the 503 cap-gate still fires when `status≠funded`
  (keep existing assertions green).
- **agent tools:** `buyer.pay` is called with the two region headers mapped from the picked
  node.
- **FetchPanel:** renders `✓ verified` when a tick's `regionVerified` is true; renders the
  actual-region city with no badge when false.
- Keep the existing suite green (streaming loop, self-fund, zero-amount guard, etc.).

Per-region correctness (that each `egressIp` actually geolocates to its city) is verified in
deploy by hitting `/api/egress` against each region — not unit-testable.

## Out of scope

Per-region pricing differences (keep each node's existing `price_per_gb_usd`); a server-side
IP→geo lookup (the egress IP is shown and independently checkable, and `FLY_REGION` is
authoritative); device-level tunneling; reviving the raw-CONNECT proxy or `api/browse`
(orphaned, removable in cleanup).

## Files touched

- `packages/core/` — `NODE_REGION` + `FLY_REGION_CITY` maps (+ index export)
- `apps/edge-node/src/index.ts` — region enforce/report in `/egress`
- `apps/edge-node/` build — esbuild bundle step + Dockerfile `node dist/index.js`
- `fly.toml` — `[http_service]` + scale-to-zero (replaces raw-TCP service)
- `apps/web/app/api/egress/route.ts` — region headers + return `region`/`regionVerified`
- `apps/agent/src/tools.ts` — region headers on the agent's `buyer.pay`
- `apps/web/components/FetchPanel.tsx` — verified / honest-actual egress badge
- `apps/edge-node/test/*`, `apps/web/test/*`, `packages/core/test/*` — per Testing
- **Deploy:** fast-boot image → `fly deploy`; `fly scale count 1 --region nrt,fra,ewr,sin,bom,lhr,yyz,gru,syd`; release dedicated IPv4; verify each region's egress IP geolocates correctly. Web → Vercel.
