# Design — Restore streaming VPN payments + professional UI

**Date:** 2026-06-30
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

Live-testing the deployed human flow surfaced two regressions from Plan 2:

1. **Streaming was killed.** Plan 2 retired the old raw-CONNECT *streaming* model (continuous
   per-byte metering, USDC settled every ~10s) for **per-click `/egress` fetches**. That lost
   the VPN feel: a real VPN keeps a stream open, meters the **data used**, and settles
   **nanopayments continuously** while connected — not one nanopayment per button click.
2. **UI regressions** in the `FetchPanel` bolted onto the dark `MapRail`: the balance line,
   "Fund from your wallet" label/input, and the result card render **dark-on-dark / white-on-
   light** (invisible or unreadable), and the buttons are inconsistently sized/styled — looks
   unprofessional vs. the prior design.

The old streaming machinery (edge-node CONNECT proxy + meter + settlement loop + `/usage` SSE,
web `Counter`/`traffic.ts`) still exists but is orphaned, and it settled from one **shared**
wallet. We must restore streaming **on per-user wallets** (no shared key, no key on the
edge-node).

## Decisions (locked during brainstorming)

- **Streaming-only** is the human action (Start/Stop streaming, continuous metered nanopayments,
  live counter). Drop the per-click "Fetch through X" as the primary; the egress-IP/geo **proof**
  is shown inline in the streaming state instead.
- **Mechanism:** a **client-driven loop of per-user nanopayments** — the web signs each tick with
  the user's key (the per-user `/egress` path, looped). No shared key; no key on the edge-node.
- **Per-byte ("data used"):** an **additive** edge-node change — `/egress` gains an opt-in
  meter-by-bytes mode so a streaming chunk is priced `bytes × $/GB`, not the flat per-request
  price. The agent path (flat per-request) is unchanged.
- **Honest egress geo:** show the egress IP's **real** geolocation (the one Fly box) — no
  city-mislabel. Real per-region egress is **Plan 3** (next).
- **Restore the professional dark-rail UI** (readable text, consistent buttons, big counter).

## Architecture

### A. Streaming loop (client-driven, per-user, per-byte)

While connected and "streaming" is on, a client loop ticks at an interval set by a **rate**
control (light/medium/heavy → 3000/1200/400 ms, mirroring the old `traffic.ts`). Each tick:

1. `POST /api/egress` (authed) with `{ nodeId, sessionId, stream: true }`.
2. The web route, in stream mode, drives a **fixed-size chunk** download through the node and
   settles a **per-user nanopayment** for it; returns `{ sessionId, bytes, egressIp, geo,
   amountMicroUsd, transaction }`.
3. The client accumulates `bytesUsed += bytes`, `spentMicroUsd += amountMicroUsd`, updates the
   **live counter**, and the settlement appears in the tape (one `settlements` row per tick).

"Stop streaming" / "Disconnect" stops the loop (AbortController; no-overlap guard like the old
`traffic.ts`).

### B. Web `/api/egress` — stream mode

`apps/web/app/api/egress/route.ts` gains a `stream` branch (keeps the existing auth + per-user
signing + settlement-record from Plan 2):
- target = `https://speed.cloudflare.com/__down?bytes=${STREAM_CHUNK_BYTES}` (server constant,
  default `262144` = 256 KB), and the node-`/egress` URL gets `&meterBytes=${STREAM_CHUNK_BYTES}`
  so the node prices per-byte.
- `buyer.pay(\`${node.proxy_url}/egress?url=${enc(target)}&meterBytes=${STREAM_CHUNK_BYTES}\`,
  { method: "POST" })` — the user's `GatewayClient` (key from `loadSigningKey`) signs the
  nanopayment, exactly as today.
- record the `settlements` row (payer = user EOA, payee = SELLER) and return the tick result
  (incl. `geo` from the node's DB row + `egressIp` from the node response).
- The capped-grant 503 gate (hardening) still applies before any tick.

### C. Edge-node `/egress` — opt-in per-byte pricing (additive)

`apps/edge-node/src/egress-endpoint.ts` + `index.ts`:
- New env `EDGE_NODE_PRICE_PER_GB_USD` (default `2.5`).
- If the request URL has `meterBytes=N` (N a positive int), price the x402 challenge as
  `microUsdForBytes(N, EDGE_NODE_PRICE_PER_GB_USD)` (already in `@nanovpn/core`); otherwise keep
  the flat `EDGE_NODE_PRICE_PER_REQUEST_USD` (agent path unchanged). The verify→fetch→settle flow
  is otherwise identical. Requires a **Fly redeploy** of the edge-node.

### D. UI restoration (`FetchPanel` → streaming panel; `MapRail`; `globals.css`)

Rework the connected-state panel to the professional dark-rail look:
- **Exit-node card** (kept).
- **Honest egress line:** `egress <IP> — <real geo>` (from a tick / a first probe), shown once
  connected.
- **Big counter:** "STREAMING SPEND $X.XXXX" + "DATA USED Y.YY MB" — light-on-dark, large
  (styled like the old `Counter`).
- **Rate** control (light/medium/heavy) — reuse the existing `intensity` state already on the map
  page.
- **Start/Stop streaming** = primary green button.
- **Balance** + **"Fund from your wallet"** — readable light-on-dark; the fund button a clear
  *secondary* style (not invisible); consistent sizing with the other buttons.
- **Settlement tape** (existing `SettlementLog`, by session).
- **Disconnect**.
- Remove the per-click "Fetch through X" primary control and the white-on-light result card.

All text uses readable colors on the dark rail (match the `.maprail` overrides that already work
for the connected rail). No new design language — restore the prior one.

## Data flow

```
Connect node → session (existing)
Start streaming → client loop @ rate:
  POST /api/egress {nodeId, sessionId, stream:true}
    → web: buyer(userKey).pay(node/egress?url=<256KB chunk>&meterBytes=262144)
       → node: price = microUsdForBytes(262144, 2.5/GB) → verify → fetch chunk → settle (Gateway)
    → web: record settlements row (payer=user EOA) → return {bytes, egressIp, geo, amountMicroUsd, tx}
  → client: counter += bytes/spend ; tape += row
Stop/Disconnect → loop aborts
```

## Error handling

| Case | Result |
|------|--------|
| Not signed in | 401 (loop stops; UI prompts sign-in) |
| Grant-capped / unfunded (status≠funded) | 503 from `/api/egress`; loop stops, UI shows "fund your wallet" (self-fund control) |
| A tick fails (node/settle error) | that tick is skipped (no counter increment), loop continues; transient errors don't kill the stream |
| Balance exhausted mid-stream | ticks 503 / settle-fail; loop stops; UI shows balance 0 + self-fund |
| Stop pressed mid-tick | AbortController + no-overlap guard → loop halts immediately after the in-flight tick |

## Testing

vitest:
- **edge-node:** `/egress` with `meterBytes=N` prices `microUsdForBytes(N, perGb)`; without it, flat
  per-request (agent path unchanged). Unit test on the pricing branch.
- **web `/api/egress` stream mode:** builds the sized chunk URL + `meterBytes`, signs via the user's
  `GatewayClient`, records a settlement, returns `{ bytes, egressIp, geo, amountMicroUsd }`; the 503
  cap gate still fires when `status≠funded`.
- **FetchPanel streaming:** starting the stream loops `/api/egress` (mock fetch) and accumulates the
  counter; stopping aborts; the self-fund control still works; renders the readable controls.
- Keep the existing suite green.

UI readability/professionalism is verified in the browser (Martin) — colors aren't unit-testable.

## Out of scope

Real per-region geo egress (**Plan 3** — makes "Frankfurt" actually egress from Frankfurt; until
then the egress line shows the one Fly box's real geo honestly); device-level tunneling; reviving
the raw-CONNECT proxy / edge settlement loop (the client-loop replaces it). The orphaned
`Counter.tsx`/`traffic.ts`/`api/browse` are superseded and can be removed in cleanup.

## Files touched

- `apps/edge-node/src/egress-endpoint.ts` + `src/index.ts` — opt-in per-byte pricing (`meterBytes`, `EDGE_NODE_PRICE_PER_GB_USD`)
- `apps/web/app/api/egress/route.ts` — `stream` mode (sized chunk + `meterBytes` + record)
- `apps/web/components/FetchPanel.tsx` — streaming loop + live counter + rate + restyled controls (or split a `StreamPanel`)
- `apps/web/components/MapRail.tsx` — wire the streaming panel; pass `intensity`/rate
- `apps/web/app/globals.css` — dark-rail readable styles, consistent buttons, big counter
- `.env.example` — `EDGE_NODE_PRICE_PER_GB_USD`, `STREAM_CHUNK_BYTES`
- `apps/web/test/*`, `apps/edge-node/test/*` — per Testing
- **Deploy:** edge-node → Fly (`fly deploy --remote-only` from repo root); web → Vercel
```
