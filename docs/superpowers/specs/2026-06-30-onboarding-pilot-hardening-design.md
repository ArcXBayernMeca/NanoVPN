# Design — Onboarding Pilot Hardening: sponsor cap + atomic funding

**Date:** 2026-06-30
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

Onboarding-pilot Plans 1 + 2 are live on prod (`main` `f7e3328`). Both flows provision +
sponsor-fund a per-user spending wallet on a user's *first* use, which created two live
exposures:

1. **Sponsor drain.** Every new SIWE user draws a $0.50 grant (agent run *or* first
   `/api/egress` fetch). The sponsor holds ~26 USDC → ~50 users and it's empty (then
   funding fails ungracefully). No cap exists.
2. **Fund-once race (I1).** `ensureProvisionedAndFunded` reads `funded_micro_usd === 0`
   then funds — two near-simultaneous first calls (double-click / two tabs) both read 0
   and both grant, double-funding.

Neither is being actively hit (only 2 `user_wallets` rows exist, both from verify runs),
but both should be closed before wider use.

## Decisions (locked during brainstorming)

- **Cap strategy:** a **global grant cap** (`MAX_SPONSORED_WALLETS`) + **lower the grant
  $0.50 → $0.10**. No per-IP/time-window infra. A capped new user still gets a wallet, just
  no grant — the clean seam into Plan 2b self-funding.
- **Atomicity:** a **`funding_status` column** + an **atomic conditional-UPDATE claim**;
  only the claim winner funds; the loser polls until funded. (Chosen over a no-migration
  sentinel and over "rely on the cap".)
- The cap is a **soft ceiling** — under heavy concurrency it may overshoot by a grant or
  two. Acceptable: the sponsor holds far more than `cap × grant`.

## Architecture

### 1. Migration `0005_funding_status.sql`

```sql
alter table user_wallets add column funding_status text not null default 'unfunded';
-- 'unfunded' | 'funding' | 'funded'
update user_wallets set funding_status = 'funded' where funded_micro_usd > 0;
```
Backfill marks the existing funded wallets so they are never re-claimed.

### 2. Config

- `apps/web/lib/funding.ts`: `USER_GRANT_USD` default `"0.50"` → **`"0.10"`** (`USER_GAS_NATIVE`
  unchanged — 0.05 native still covers approve+deposit regardless of grant size). $0.10 =
  100_000 µUSD ≈ 100 human fetches or 2 agent runs (bounded by `MAX_AGENT_BUDGET_USD=0.05`).
- New env `MAX_SPONSORED_WALLETS` (default **100**; ≈ $10 USDC + ~$5 native of the ~26+26
  the sponsor holds — ~2.5× headroom). Read in `user-wallet.ts`.

### 3. `ensureProvisionedAndFunded` (rewrite) — the core

New return: `{ eoaAddress: \`0x${string}\`; fundedMicroUsd: number; status: 'funded' | 'capped' | 'pending' }`.
`getOrCreateUserWallet` also returns `fundingStatus` (its select + the fast-path check need it).

Logic:
1. `wallet = getOrCreateUserWallet(userId)`. If `wallet.fundingStatus === 'funded'` →
   return `{ eoa, fundedMicroUsd, status: 'funded' }` (fast path; no claim).
2. **Atomic claim:** `update(user_wallets).set(funding_status='funding')
   .eq(user_id).eq(funding_status,'unfunded').select('user_id')`.
   - **Won (a row returned):**
     - **Cap check:** count rows where `funding_status='funded'`. If `>= MAX_SPONSORED_WALLETS`
       → release the claim (`set funding_status='unfunded' where user_id`) and return
       `{ eoa, fundedMicroUsd: 0, status: 'capped' }` (no `fundSponsored` call).
     - Else: `granted = fundSponsored(key)` → `set funding_status='funded',
       funded_micro_usd=granted where user_id` → return `{ eoa, granted, status: 'funded' }`.
   - **Lost (no row):** poll the row ~10× at 1s: if `funding_status` becomes `'funded'` →
     return funded; if it's back to `'unfunded'` → return `'capped'`; on timeout → `'pending'`.

### 4. Callers

- `apps/web/app/api/agent/run/route.ts` & `apps/web/app/api/egress/route.ts`: after
  `ensureProvisionedAndFunded`, if `status !== 'funded'` → **503**
  `{ error: "demo grant capacity reached — self-funding coming soon" }` (no spend; the 401
  auth gate is unchanged and still first).
- `apps/web/app/api/wallet/route.ts`: include `fundingStatus` in the response
  (`{ eoaAddress, fundedMicroUsd, spentMicroUsd, fundingStatus }`) so the FetchPanel can
  later surface a "self-fund" prompt — the Plan 2b seam. (No FetchPanel behavior change in
  this spec beyond reading the new field if convenient; UI prompt is Plan 2b.)

## Data flow

```
first use → getOrCreateUserWallet (idempotent on user_id)
          → funded?  ── yes ──> proceed (fast path)
                   └─ no ──> atomic claim (UPDATE ... WHERE funding_status='unfunded' RETURNING)
                              ├─ won + under cap → fundSponsored → status='funded'
                              ├─ won + at cap    → release → status='capped' → caller 503
                              └─ lost            → poll until 'funded' (or 'capped'/'pending')
```

## Error handling

| Case | Result |
|------|--------|
| At cap | wallet exists, `status='capped'`, agent/egress return 503 (clear message); user can retry later or self-fund (Plan 2b) |
| Lost-claim timeout (`pending`) | caller returns 503 (retryable); rare, only under a real race + slow funding |
| `fundSponsored` throws (gas/sponsor issue) after winning claim | claim left as `'funding'`; the row is **not** wrongly marked funded; subsequent calls poll then time out → 503. (Acceptable; a stuck `'funding'` row can be reset manually. A `try/finally` that reverts `'funding'→'unfunded'` on failure is a nice-to-have, included in the plan.) |
| Cap soft-overshoot under concurrency | at most a few extra $0.10 grants; within sponsor headroom |

## Testing

vitest, mocking `@/lib/supabase-server` + `@/lib/funding`:
- already-funded → returns `funded`, no claim UPDATE, no `fundSponsored`.
- unfunded + under cap → claim wins, `fundSponsored` called, status set `funded`.
- unfunded + **at cap** → claim wins, count ≥ MAX → **releases**, returns `capped`, `fundSponsored` NOT called.
- lost claim (claim UPDATE returns no row) → polls; when the mocked row flips to `funded`, returns `funded`.
- `/api/agent/run` + `/api/egress`: `status='capped'` → 503 with no `prepareRun`/`buyer.pay` call; `status='funded'` → proceeds.
- funding test: grant `"0.10"` → `deposit("0.10")` → returns `100_000`.
- Keep the existing suite green (callers' funded-path tests still pass).

## Out of scope

Per-IP/time-window rate limiting; the FetchPanel "self-fund" UI prompt (Plan 2b);
MetaMask self-funding (Plan 2b); real geo regions (Plan 3); cleanup of orphaned
`Counter.tsx`/`traffic.ts`/`api/browse` (separate). Edge-node untouched.

## Files touched

- `supabase/migrations/0005_funding_status.sql` — new column + backfill (manual apply)
- `apps/web/lib/user-wallet.ts` — `funding_status` in select/return; rewrite `ensureProvisionedAndFunded` (claim + cap + poll)
- `apps/web/lib/funding.ts` — `USER_GRANT_USD` default `0.10`
- `apps/web/app/api/agent/run/route.ts` — 503 when not `funded`
- `apps/web/app/api/egress/route.ts` — 503 when not `funded`
- `apps/web/app/api/wallet/route.ts` — include `fundingStatus`
- `.env.example` — `MAX_SPONSORED_WALLETS`; note `USER_GRANT_USD` default changed
- `apps/web/test/*` — per Testing
```
