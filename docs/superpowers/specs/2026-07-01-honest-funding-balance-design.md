# Design — Honest funding balance (real Gateway balance + confirmed-deposit crediting)

**Date:** 2026-07-01
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

Live testing surfaced that the human VPN panel's **"Balance"** is a fiction. Three bugs
in the self-fund → ledger → display chain (from the earlier onboarding-pilot work, not the
Plan 3 multi-region work):

1. **Self-fund credits money it never confirmed was deposited.** `depositOwnBalance`
   (`apps/web/lib/self-fund.ts`) reads the spending EOA's raw USDC balance, calls
   `gateway.deposit(...)`, and **returns the full pre-deposit balance** as "deposited" —
   without waiting for the deposit's transaction receipt or checking it succeeded.
   `apps/web/app/api/self-fund/route.ts` then credits `funded_micro_usd` by that amount
   unconditionally.
2. **Because a failed deposit doesn't clear the raw balance, retries double-count.** Each
   self-fund re-reads the *accumulating* EOA raw balance and re-credits it, so
   `funded_micro_usd` diverges upward.
3. **The UI shows the local ledger, not the real balance.** `apps/web/app/api/wallet/route.ts`
   returns `funded_micro_usd` (ledger) and a `spent` computed from the `settlements` table;
   the panel shows `funded − spent`. But nanopayments actually spend from the **Circle Gateway
   available balance**, which is the true spendable number.

**Observed reconciliation** for one live wallet (spending EOA `0x1B09…661C`): ledger
`funded = $3.1919` · **real Gateway available = $0.082** · stranded (undeposited) in the EOA
raw wallet = `$2.044` · settled to the seller = `$0.018`. Funds are safe, but both the ledger
and the displayed balance are wrong.

SDK note: `GatewayClient.deposit()` returns a `DepositResult { approvalTxHash?, depositTxHash,
amount, ... }` (it does not guarantee the deposit is mined before returning), and Gateway
deposits have a **finalization delay** before the deposited USDC shows as *available*.

## Decisions (locked during brainstorming)

- **The displayed balance's source of truth becomes the live Circle Gateway available
  balance** (not the `funded − spent` ledger). Approach A of the three considered (A: live
  balance + confirmed-delta crediting; B: live balance, drop the ledger from the UI entirely;
  C: self-healing reconciled ledger). A keeps an honest `funded_micro_usd` record while making
  the shown balance always real.
- **Self-fund credits only confirmed deposits, and "confirmed" = the deposit transaction
  receipt succeeded** — robust to Gateway's finalization lag (which the live-balance display
  absorbs on screen). If the deposit is not confirmed, **error and credit nothing**.
- **Recover the currently-stranded funds**: Approach A does this naturally — the stranded USDC
  is already in the EOA raw balance, so the next self-fund deposits the whole raw balance and
  (now that we wait for the receipt) credits it correctly once.

## Architecture

### A. `apps/web/lib/gateway-balance.ts` (new, shared)

`gatewayAvailableMicroUsd(address: string): Promise<number | null>` — POST Circle
`${ARC.facilitator}/v1/balances` with `{ token: "USDC", sources: [{ domain: ARC.domain,
depositor: address }] }`, read `balances[0].balance` (a decimal USDC string), convert to
integer µUSD (`Math.round(Number(balance) * 1e6)`), and return it. Return **`null`** on a
non-OK response or fetch error (never throw, never fabricate). This is the single place that
reads a Gateway available balance; `apps/web/app/api/balance/route.ts` is refactored to use it
(DRY), and `/api/wallet` + self-fund consume it.

### B. `apps/web/lib/self-fund.ts` — verify before crediting

`depositOwnBalance(eoaPrivateKey)`:
1. Read the EOA's raw USDC balance; if `0n` → return `0` (nothing to deposit).
2. Sponsor gas if `native < MIN_NATIVE` (unchanged).
3. `const r = await gateway.deposit(formatUnits(balance, ARC.usdcDecimals))`.
4. **`const receipt = await arcPublicClient().waitForTransactionReceipt({ hash: r.depositTxHash })`;
   if `receipt.status !== "success"` → `throw new Error("deposit transaction failed")`.**
5. Return `Number(r.amount)` — the confirmed-on-chain µUSD deposited.

A confirmed deposit clears the EOA raw balance, so a subsequent self-fund cannot re-credit the
same USDC (fixes the double-count). A reverted/never-mined deposit throws (fixes the
silent-credit).

### C. `apps/web/app/api/self-fund/route.ts` — error, credit nothing on failure

`deposited = await depositOwnBalance(key)`. If `deposited <= 0` → 400 with an honest message
(raw balance was 0 → "transfer USDC to your spending wallet first"; a thrown deposit surfaces
its error → "deposit didn't go through — your USDC is safe in your wallet, try again"). Only on
a confirmed `deposited > 0` → `addFunding(userId, deposited, "metamask")`. Response:
`{ depositedMicroUsd, fundedMicroUsd, gatewayMicroUsd }` (the last from `gatewayAvailableMicroUsd`
so the client can refresh the real balance immediately).

### D. `apps/web/app/api/wallet/route.ts` — return the real balance

After `ensureProvisionedAndFunded`, also call `gatewayAvailableMicroUsd(wallet.eoaAddress)` and
add `gatewayMicroUsd` to the response. Keep `fundedMicroUsd` and `spentMicroUsd` (now honest,
used for the secondary "of $X funded" line).

### E. `apps/web/components/FetchPanel.tsx` — show the real balance

- `balance` state gains `gatewayMicroUsd: number | null`.
- The big **"Balance"** number renders `formatUsd(gatewayMicroUsd)` when it's a number; when
  `null` (transient Circle error) it renders a muted **"syncing…"** — never a fabricated
  number. The secondary line keeps "of `formatUsd(fundedMicroUsd)` funded".
- `refreshWallet()` sets `gatewayMicroUsd` from `/api/wallet`; `selfFund()` calls
  `refreshWallet()` on success (already does). The streaming "STREAMING SPEND" counter is
  unchanged (it's session spend, not balance).

## Data flow (self-fund)

```
MetaMask → spending EOA (raw USDC)
  POST /api/self-fund → depositOwnBalance:
    gateway.deposit()  → { depositTxHash, amount }
    waitForTransactionReceipt(depositTxHash).status === "success" ?
        │ no  → throw → route 400, NO credit (USDC stays in EOA)
        │ yes → return Number(amount) → addFunding(confirmed µUSD)
  /api/wallet → Balance = gatewayAvailableMicroUsd(EOA)  (updates as Circle finalizes)
```

Stranded funds recover: the ~$2.04 already sits in the EOA raw balance, so the next self-fund
deposits it and credits it once (receipt-verified).

## Error handling

| Case | Result |
|---|---|
| Deposit tx reverts / never mined | `depositOwnBalance` throws → self-fund 400, no credit, USDC safe in EOA |
| Gateway finalization lag | Deposit tx confirmed → credited; live Balance shows it once Circle finalizes (seconds) |
| Circle `/v1/balances` error | `gatewayMicroUsd: null` → UI shows "syncing…", retries on next refresh; never a fake number |
| EOA raw balance is 0 | 400 "transfer USDC to your spending wallet first" |
| Not signed in | 401 (unchanged) |

## Testing (vitest)

- **`gateway-balance`**: parses a decimal balance string → integer µUSD; returns `null` on a
  non-OK response.
- **`self-fund` lib**: throws when the deposit receipt status is not `success`; returns
  `r.amount` on success (mock `gateway.deposit` → `{ depositTxHash, amount }` and
  `arcPublicClient().waitForTransactionReceipt`).
- **`self-fund` route**: 400 and **no** `addFunding` when `depositOwnBalance` returns 0 or
  throws; credits the confirmed amount and returns `gatewayMicroUsd` on success.
- **`wallet` route**: returns `gatewayMicroUsd` from the live balance (mock
  `gatewayAvailableMicroUsd`); keeps `fundedMicroUsd`/`spentMicroUsd`.
- **`FetchPanel`**: renders the Gateway balance as "Balance" when numeric; renders "syncing…"
  when `null`. Existing self-fund / zero-amount / streaming tests stay green.
- **Live verify (Martin)**: one self-fund → the stranded ~$2.04 lands in Gateway and the
  "Balance" shows the real Gateway number.

## Out of scope

The `$0.0007`-per-tick pricing (correct by design — fixed 256 KB chunk × $2.50/GB). The sponsor
grant flow (`ensureProvisionedAndFunded` already sets `funded_micro_usd` to the real granted
amount). The x402 / settlement path. No DB migration (schema unchanged; `funded_micro_usd`
keeps its meaning, now honest).

## Files touched

- `apps/web/lib/gateway-balance.ts` — new `gatewayAvailableMicroUsd`
- `apps/web/lib/self-fund.ts` — wait for deposit receipt + return confirmed amount
- `apps/web/app/api/self-fund/route.ts` — error/no-credit on unconfirmed; return `gatewayMicroUsd`
- `apps/web/app/api/wallet/route.ts` — return `gatewayMicroUsd`
- `apps/web/app/api/balance/route.ts` — refactor to use `gatewayAvailableMicroUsd` (DRY)
- `apps/web/components/FetchPanel.tsx` — Balance = live Gateway balance / "syncing…"
- `apps/web/test/*` — per Testing
- **Deploy:** web → Vercel (no edge-node / Fly change; no DB migration)
