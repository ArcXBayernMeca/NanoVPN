# Design — Agent & Settlement UX (Layer 2.9)

**Date:** 2026-06-22
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

Four issues surfaced while live-testing the deployed app (all in `apps/web`; the
on-chain/settlement backend is correct and untouched):

1. **Dead ArcScan link.** The settlement tape's "view ↗" links to the seller's
   address page, which is empty (0 USDC, 0 txns). Root cause: settlements are
   **same-chain Arc→Arc Circle Gateway transfers** — USDC moves inside Gateway's
   unified-balance *accounting* (burn from payer's Gateway balance → credit
   payee's), with **no per-payment on-chain transaction**; the chain is only
   touched on deposit/withdraw. The facilitator transfer record
   (`GET {facilitator}/v1/x402/transfers/{uuid}`) is verifiable (`status:
   "completed"`, `fromAddress`, `toAddress`, `amount`, networks) but contains **no
   tx hash**, so `fetchSettlementTxHash` always returns null and the link degrades.

2. **Agent rail frozen.** [apps/web/app/agent/page.tsx](../../../apps/web/app/agent/page.tsx)
   is a server component that reads the `agent_runs` row **once** and passes
   `node_id`/`spent`/`status` to `AgentStatusRail` as static props. The rail has no
   realtime subscription, so loaded mid-run it sticks at "choosing…" / $0.0000 /
   RUNNING forever, while the left `AgentFeed` updates (it subscribes to
   `agent_events`). The data *is* written live
   ([apps/web/../agent/src/events.ts](../../../apps/agent/src/events.ts): `spent_micro_usd`
   on each payment, `node_id` on choice) and `agent_runs` is in the realtime
   publication (`supabase/migrations/0002_agent.sql:31`).

3. **Verbose, duplicated result.** The agent's final `RESULT` event duplicates the
   last `REASONING` block and is a long paragraph.

4. **Silent settlement failure.** When settlement fails (e.g. low Gateway balance),
   the human rail just shows `unsettled` growing forever with no explanation.

## Decisions (locked during brainstorming)

- **#1:** verified facilitator record per row + one real on-chain "funding" anchor.
- **#2:** make the rail live via a realtime subscription to `agent_runs`.
- **#3:** Answer card + dedupe, **UI only** (no agent/prompt change).
- **#0:** client-side heuristic for the settlement-paused warning (no edge-node change).
- **Scope:** one PR, **web-only** → only a Vercel redeploy is needed (no Fly/edge-node redeploy).

## Architecture

### #2 — Agent rail live-update

- New hook `apps/web/lib/use-agent-run-status.ts`:
  ```ts
  function useAgentRunStatus(
    runId: string,
    initial: { nodeId: string | null; spentMicroUsd: number; status: string },
  ): { nodeId: string | null; spentMicroUsd: number; status: string }
  ```
  On mount: seed state from `initial`, backfill once via
  `select("node_id,spent_micro_usd,status").eq("id", runId)`, and subscribe to
  `postgres_changes` UPDATE on `public.agent_runs` filtered `id=eq.<runId>`,
  mapping `new.node_id` / `new.spent_micro_usd` / `new.status` into state.
  Mirrors `AgentFeed`'s backfill-on-mount + realtime pattern. Cleans up the
  channel on unmount.
- `AgentStatusRail` gains `runId` and uses the hook; `budgetMicroUsd` + `nodes`
  stay static props. `app/agent/page.tsx` passes `runId={row.id}` plus the initial
  `node_id`/`spent_micro_usd`/`status`.

### #1 — Settlement proof presentation

- New server route `apps/web/app/api/settlement/[uuid]/route.ts` (`runtime =
  "nodejs"`): proxies `GET ${ARC.facilitator}/v1/x402/transfers/{uuid}` and returns
  `{ from, to, amount, status, network }` (or `{ error }` with the upstream status).
  Server-side to avoid browser CORS.
- New shared client component `apps/web/components/SettlementProof.tsx`:
  ```ts
  function SettlementProof(props: {
    uuid: string;
    amountMicroUsd: number;
    payer?: string | null;   // shown immediately if known
    payee?: string | null;
    network?: string | null;
  }): JSX.Element
  ```
  Renders a `✓ verified ⌄` toggle. Collapsed: just the badge. Expanded: `payer →
  payee`, amount, `Arc (eip155:5042002)`, and status — status starts from the
  caller-provided value (or "received") and is upgraded to the facilitator's
  authoritative status by lazily fetching `/api/settlement/<uuid>` on first
  expand (best-effort; failure leaves the row-provided values).
- `SettlementLog` (human): add `payer`, `network` to its `select`; render each row's
  amount + `<SettlementProof uuid payer payee network amountMicroUsd>`. Add one
  section-level anchor `Payer wallet on Arc ↗` → `explorerAddr(payer)` (the buyer
  wallet, which has real on-chain Gateway-funding activity), shown when at least one
  row exists.
- `AgentFeed` (agent payments): the payment event content carries the settlement
  `transaction` (uuid) and `amount`; render `<SettlementProof uuid amountMicroUsd>`
  in place of the dead `settlementUrl(...)` link (payer/payee come from the lazy
  facilitator fetch). Keep the existing geo-proof (egress IP) display.
- `settlementUrl` / `fetchSettlementTxHash` in `@nanovpn/core` stay (the edge-node
  still calls the latter harmlessly); the UI simply stops depending on `tx_hash`.

### #3 — Answer card + dedupe (AgentFeed, UI only)

- When a `result` event exists, render it as a prominent **Answer card** at the top
  of the feed column (above the reasoning/tool trail), visually distinct.
- Dedupe: when rendering the event list, suppress any `reasoning` event whose
  trimmed content equals the `result` event's trimmed content (the terminal text
  the agent emits as both). No change to the agent or its prompt.

### #0 — Settlement-paused safeguard (client heuristic)

- `Counter` gains an optional `onUnsettled?(microUsd: number): void` callback,
  invoked from its existing usage-SSE `onmessage` with `tick.unsettledMicroUsd`.
- `MapRail` tracks the latest unsettled value and, when it is `≥ 50_000` µUSD
  ($0.05 = 5× the $0.01 settle threshold; the loop settles every 2s so healthy
  unsettled never reaches this), renders a warning in the settlements section:
  **"⚠ Settlement paused — buyer balance low (unsettled $X.XX not posting)."**
  Hidden otherwise. Web-only; no edge-node signal.
  - Threshold constant lives in `apps/web` (e.g. `STUCK_UNSETTLED_MICRO_USD =
    50_000`), not a magic number inline.

## Data flow

```
Agent rail:    agent_runs row (live: node_id, spent) ──realtime UPDATE──> useAgentRunStatus ──> AgentStatusRail
Settlement:    settlements row (payer,payee,amount,network) ──> SettlementProof (instant)
                                         └─ on expand ──> /api/settlement/<uuid> ──> facilitator (status: completed)
               section anchor ──> explorerAddr(payer) ──> ArcScan (real funding txns)
Answer:        result event ──> Answer card (top); matching final reasoning suppressed
Safeguard:     usage SSE tick.unsettledMicroUsd ──onUnsettled──> MapRail (≥ $0.05 ⇒ warning)
```

## Error handling

| Case | Result |
|------|--------|
| `/api/settlement/<uuid>` upstream non-200 or fetch fails | route returns `{ error }`; SettlementProof keeps the row-provided values, no crash |
| Facilitator slow | lazy fetch is on-expand and best-effort; collapsed view never blocks |
| `agent_runs` realtime drops a message | backfill-on-mount covers the initial state; status still flips on later updates; a completed run shows final state on load |
| `payer` missing on a row | section anchor hidden; per-row proof still shows amount/payee |
| usage SSE not connected | `onUnsettled` simply never fires; no warning (same as today) |

## Testing

vitest + @testing-library (jsdom per-file), matching existing patterns:

- **#2:** `useAgentRunStatus` (or the rail) reflects a simulated `agent_runs` UPDATE
  (mock supabase realtime) — node/spend/status change from initial → updated.
- **#1:** `SettlementProof` shows the badge collapsed and reveals `payer→payee` +
  amount + Arc on expand; `/api/settlement/[uuid]` maps a mocked facilitator
  response to `{from,to,amount,status,network}` and returns `{error}` on upstream
  failure; `SettlementLog` renders the `Payer wallet on Arc ↗` anchor when rows exist.
- **#3:** `AgentFeed` renders an Answer card from a `result` event and does not also
  render the duplicate final `reasoning` block.
- **#0:** `MapRail` shows the settlement-paused warning when fed unsettled ≥ $0.05
  and hides it below.

## Out of scope

Edge-node / Fly changes (the safeguard is client-side; the moot `tx_hash`
enrichment stays), the on-chain settlement mechanism (works), node pricing, and the
agent's reasoning/result prompt (the result fix is UI-only).

## Files touched (all under apps/web)

- `lib/use-agent-run-status.ts` — new hook [#2]
- `components/AgentStatusRail.tsx` — live via hook [#2]
- `app/agent/page.tsx` — pass `runId` + initial values [#2]
- `app/api/settlement/[uuid]/route.ts` — new facilitator proxy [#1]
- `components/SettlementProof.tsx` — new shared verified-proof component [#1]
- `components/SettlementLog.tsx` — use SettlementProof + payer anchor; select payer [#1]
- `components/AgentFeed.tsx` — SettlementProof for payments [#1]; Answer card + dedupe [#3]
- `components/Counter.tsx` — `onUnsettled` callback [#0]
- `components/MapRail.tsx` — settlement-paused warning [#0]
- `app/globals.css` — styles (verified detail, answer card, warning, anchor)
- `test/*` — new tests per above
