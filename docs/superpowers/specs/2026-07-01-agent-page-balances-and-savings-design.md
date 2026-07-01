# Design — Agent page: wallet balances + savings benchmark

**Date:** 2026-07-01
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

The `/agent` page shows the agent reasoning + paying, but not the user's money context:
1. You can't see your **wallet balance** (MetaMask USDC) or **spending balance** (Gateway)
   before launching a run — the same info we just added to the map page's rail.
2. There's no sense of the **value** the metered egress delivers — how much the run cost vs.
   what the same geo-located egress would cost through a commercial residential proxy.

## Decisions (locked during brainstorming)

- **Balances (reuse the map-page pattern):** show the connected MetaMask wallet's Arc USDC
  balance + the Gateway spending balance **at the top** (the full `WalletPanel`, with Fund, so
  you can top up before a run) **and** compactly **in the rail next to Budget** (read-only).
- **Savings benchmark (in the rail, under Budget):** cumulative for the run —
  **saved = (bytes fetched × a per-location residential rate) − what you actually paid**, shown
  honestly (no fake savings when fetches are too small to beat the flat per-request fee).
- **Per-location reference rate, grounded in our own data:** `reference $/GB = the chosen
  node's pricePerGbUsd × RESIDENTIAL_MARKUP` (a constant, default **5**). Our node
  `price_per_gb_usd` already varies by region (Mumbai $1.4 → ~$7/GB, Tokyo $3.0 → ~$15/GB),
  so the "without-VPN" cost is higher for pricier regions; average ≈ $10/GB. Labeled an
  **illustrative residential estimate** (not a quoted vendor price).
- **What you paid** = the run's `spent_micro_usd` (sum of the flat per-request charges,
  settled on-chain). **Bytes** = sum of `bytes` across the run's `payment` events.

## Architecture

### Piece 1 — Balances

**A. `apps/web/lib/use-wallet-balances.ts` (new hook)** — extracted from the balance-reading
logic currently inline in `WalletPanel`:
- `useWalletBalances(): { walletMicroUsd: number | null; gatewayMicroUsd: number | null;
  fundedMicroUsd: number | null; eoaAddress: string | null; refresh: () => Promise<void> }`
- Reads the MetaMask USDC via wagmi `useReadContract({ address: ARC.usdc, functionName:
  "balanceOf", args: [address], chainId: ARC.chainId, query: { enabled: !!address } })`
  (`walletMicroUsd = Number(data)` or `null`), and fetches `/api/wallet` on mount + a 15s poll
  for `gatewayMicroUsd`/`fundedMicroUsd`/`eoaAddress`.

**B. Refactor `apps/web/components/WalletPanel.tsx`** to consume `useWalletBalances()` (its Fund
control stays — the sufficient-balance guard uses `walletMicroUsd`, the transfer uses
`eoaAddress`, `refresh()` runs after a fund). Its 5 tests keep passing (the `wagmi`/`fetch`
mocks apply to the hook).

**C. `apps/web/components/WalletBalances.tsx` (new, compact, read-only)** — two lines,
`Wallet <$X>` and `Spending <$Y>`, with the same `—`/`syncing…` fallbacks, driven by
`useWalletBalances()`. For the rail.

**D. `apps/web/components/AgentWalletPanel.tsx` (new, client wrapper)** — gates the full
`WalletPanel` on sign-in: `const { signedIn } = useWallet(); return signedIn ? <WalletPanel/> :
null;`. Rendered near `AgentRunForm` at the top of the agent page.

### Piece 2 — Savings benchmark

**E. `packages/core` — `residentialSavings` + `RESIDENTIAL_MARKUP`** (in `pricing.ts`,
reusing `microUsdForBytes`):
- `RESIDENTIAL_MARKUP = 5` — how many times a metered geo rate a residential proxy runs
  (illustrative; keeps the average reference ≈ $10/GB).
- `residentialSavings(bytes: number, paidMicroUsd: number, refUsdPerGb: number): {
  referenceMicroUsd: number; savedMicroUsd: number; pct: number }` where
  `referenceMicroUsd = microUsdForBytes(bytes, refUsdPerGb)`,
  `savedMicroUsd = referenceMicroUsd − paidMicroUsd`,
  `pct = referenceMicroUsd > 0 ? Math.round(savedMicroUsd / referenceMicroUsd * 100) : 0`.
  (`bytes <= 0` → all-zero result.)

**F. `apps/web/lib/use-agent-bytes.ts` (new hook)** — mirrors `useAgentRunStatus`: seed 0,
fetch the run's `payment` events once (`agent_events` where `run_id = eq` and `kind = eq
'payment'`, selecting `content`) and **sum `content.bytes` client-side**, then apply realtime
INSERTs (add each new payment event's `content.bytes`) on its own channel
(`agent-bytes-${runId}`, distinct from the AgentFeed channel). Returns the total bytes
(`number`). (PostgREST can't SUM a jsonb field, so the sum is done in JS — same load pattern the
AgentFeed already uses for events.)

**G. `apps/web/components/SavingsBenchmark.tsx` (new)** — props
`{ bytes: number; spentMicroUsd: number; refUsdPerGb: number | null }`. Computes
`residentialSavings(bytes, spentMicroUsd, refUsdPerGb ?? 0)` and renders. **Honesty (audit —
circle:use-usdc):** the reference is derived from our own node price × markup, so the UI must
mark it unmistakably as an **estimate**, transparent about the assumption — never presented as a
quoted vendor price:
- `bytes === 0` or `refUsdPerGb == null` → muted "no savings yet".
- `savedMicroUsd > 0` → **"Saved `formatUsd(savedMicroUsd)` (`pct`%)"** + a detail line
  "you paid `formatUsd(spentMicroUsd)` · vs residential proxy ≈ `formatUsd(referenceMicroUsd)`"
  + a muted footnote **"est. — assumes a residential proxy ~`RESIDENTIAL_MARKUP`× a metered
  `$refUsdPerGb ÷ RESIDENTIAL_MARKUP`/GB geo rate"** (i.e. the label states the assumption, not a
  bare "@ $X/GB").
- `savedMicroUsd <= 0` → the detail line only (no "saved" headline) — honest, never a negative
  savings claim.

**H. Wire `apps/web/components/AgentStatusRail.tsx`:**
- Add `<WalletBalances />` right after the Budget block.
- Compute `refUsdPerGb = chosen ? chosen.pricePerGbUsd * RESIDENTIAL_MARKUP : null` (the chosen
  node is already `nodes.find(n => n.id === nodeId)`); add
  `const bytes = useAgentBytes(runId);` and render `<SavingsBenchmark bytes={bytes}
  spentMicroUsd={spentMicroUsd} refUsdPerGb={refUsdPerGb} />` below the status.

**I. `apps/web/app/agent/page.tsx`** — render `<AgentWalletPanel />` near `<AgentRunForm />`
(both the empty-state and run-loaded branches).

**J. `apps/web/app/globals.css`** — small rules for `.walletbalances` (reuse `.streampanel__*`
tokens) and `.savings` (headline + detail).

## Data flow

```
useWalletBalances → WalletPanel (top, via AgentWalletPanel gate) + WalletBalances (rail)
useAgentRunStatus (nodeId, spentMicroUsd) + useAgentBytes (bytes)
  → refUsdPerGb = chosenNode.pricePerGbUsd × RESIDENTIAL_MARKUP
  → residentialSavings(bytes, spentMicroUsd, refUsdPerGb) → SavingsBenchmark (rail)
```

## Error handling

| Case | Result |
|---|---|
| Not signed in (top) | `AgentWalletPanel` renders nothing |
| Wallet/Gateway balance null | `—` / `syncing…` (reused, never fabricated) |
| No node chosen yet (choosing…) | `refUsdPerGb = null` → benchmark shows "no savings yet" |
| No payments yet (bytes 0) | benchmark shows "no savings yet" |
| reference ≤ paid (tiny fetches) | detail line only, no "saved" headline (honest) |

## Testing (vitest)

- **core `residentialSavings`**: positive case (1 MB @ $15/GB vs $0.001 paid → saved µUSD + pct);
  `bytes = 0` → zeros; reference ≤ paid → negative `savedMicroUsd` (component clamps, fn reports
  it). `RESIDENTIAL_MARKUP === 5`.
- **`WalletBalances`**: renders Wallet + Spending numbers (mock `useWalletBalances`); `—` /
  `syncing…` on nulls.
- **`WalletPanel`**: unchanged behaviour after the hook refactor — existing 5 tests stay green.
- **`SavingsBenchmark`**: "Saved $X (N%)" when `saved > 0`; detail-only (no "Saved") when
  `reference ≤ paid`; "no savings yet" when `bytes = 0` / `refUsdPerGb == null`; the estimate
  footnote (an "est."/"estimate" marker) is present whenever a reference is shown (audit — the
  savings must never read as a quoted vendor price).
- **`AgentStatusRail`**: renders `WalletBalances` + `SavingsBenchmark` (mock `useAgentBytes`,
  `useWalletBalances`, `useAgentRunStatus`); `refUsdPerGb` derived from the chosen node.
- **`useAgentBytes`**: (light) sums initial payment bytes + a realtime insert (mock
  `supabaseBrowser`), or covered via the AgentStatusRail test with the hook mocked.
- Keep the existing web + core suites green.

Visual placement/readability on the agent page is verified in the browser (Martin).

## Out of scope

Per-fetch savings rows in the feed (cumulative only); changing agent/node pricing; the map page
(unchanged); real vendor proxy quotes (the reference is an illustrative, documented estimate).
No DB migration — bytes are summed from the existing `agent_events.content`.

## Files touched

- `packages/core/src/pricing.ts` — `residentialSavings` + `RESIDENTIAL_MARKUP` (+ index already exports pricing)
- `packages/core/test/pricing.test.ts` — savings tests
- `apps/web/lib/use-wallet-balances.ts` — new hook (extracted from WalletPanel)
- `apps/web/components/WalletPanel.tsx` — consume the hook
- `apps/web/components/WalletBalances.tsx` — new compact read-only balances
- `apps/web/lib/use-agent-bytes.ts` — new realtime bytes-sum hook
- `apps/web/components/SavingsBenchmark.tsx` — new benchmark UI
- `apps/web/components/AgentWalletPanel.tsx` — new sign-in-gated wrapper for the top
- `apps/web/components/AgentStatusRail.tsx` — wire WalletBalances + SavingsBenchmark
- `apps/web/app/agent/page.tsx` — render AgentWalletPanel near the form
- `apps/web/app/globals.css` — `.walletbalances` + `.savings` rules
- `apps/web/test/*` — per Testing
- **Deploy:** web → Vercel (no edge-node/Fly, no DB migration)
