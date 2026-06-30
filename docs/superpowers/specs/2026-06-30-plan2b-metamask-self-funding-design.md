# Design — Plan 2b: MetaMask self-funding

**Date:** 2026-06-30
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

The onboarding pilot funds each user's spending EOA with a sponsored **$0.10** grant,
now bounded by a global cap (`MAX_SPONSORED_WALLETS`). Two gaps remain: (1) a **capped**
user is stuck (their spending routes 503 with "self-funding coming soon"); (2) any user
who burns through their grant has no way to add more. Sponsoring doesn't scale. Plan 2b
adds a **self-funding** path: a signed-in user moves their own testnet USDC from the
**already-connected MetaMask** into their spending wallet.

## Decisions (locked during brainstorming)

- **Role:** escape-hatch **+ top-up**. The sponsored $0.10 stays the default first-run
  experience; self-funding is for capped users (the 503 seam) **and** a "fund from your
  wallet" top-up anyone can use. Purely additive — the sponsored/cap path is unchanged.
- **Amount:** user-entered, **default $1** USDC.
- **Trust-minimized:** the backend deposits the EOA's **actual on-chain USDC balance**,
  not a client-claimed number. The MetaMask transfer is the source of truth.
- **Gas:** the backend sponsors the EOA's small native gas for the deposit if it has none
  (~$0.05 — gas, *not* the grant; not the drain vector the cap protects).
- **Accounting:** self-funding **increments** `funded_micro_usd` (the increment the
  deleted `markFunded` lacked), sets `funding_status='funded'`, `funding_source='metamask'`.
- No new connect step — the wallet is already connected (wagmi `injected`) from SIWE
  sign-in. No identity change.

## Architecture

The wallet is already connected: `WalletProvider` uses wagmi `useAccount`/`injected`, so
`FetchPanel` can call `useWriteContract`/`useWaitForTransactionReceipt` directly.

### Client flow (`FetchPanel`)
1. `FetchPanel`'s mount fetch of `/api/wallet` already runs; extend it to keep
   `eoaAddress` + `fundingStatus` (today it keeps only funded/spent).
2. A **"Fund from your wallet"** block: an amount input (default `"1"`) + button, shown
   to all, surfaced prominently when `fundingStatus !== 'funded'` or remaining ≤ 0.
3. On click: `writeContract({ address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
   args: [eoaAddress, parseUnits(amount, 6)] })` → MetaMask popup → sign →
   `useWaitForTransactionReceipt({ hash })`.
4. After the transfer confirms: `POST /api/self-fund` → refresh `/api/wallet` (balance +
   status update).

### `POST /api/self-fund/route.ts` (new, authed)
```
runtime = "nodejs"
- require siwe-address cookie (401); userId = lower(address)
- getOrCreateUserWallet(userId)        // ensure the row/EOA exists (no funding)
- key = loadSigningKey(userId)
- deposited = await depositOwnBalance(key)   // µUSD actually deposited
- if deposited === 0 → 400 "no USDC received — transfer to your spending wallet first"
- fundedMicroUsd = await addFunding(userId, deposited, "metamask")
- 200 { depositedMicroUsd: deposited, fundedMicroUsd }
- catch → 500
```

### `apps/web/lib/self-fund.ts` (new)
`depositOwnBalance(eoaPrivateKey): Promise<number>` (returns deposited µUSD):
- read the EOA's USDC balance: `arcPublicClient().readContract(ARC.usdc, erc20Abi,
  "balanceOf", [eoa.address])`. If `0n` → return `0`.
- if the EOA's native balance is below a small threshold, the sponsor sends `USER_GAS_NATIVE`
  (reuse `funding.ts`'s sponsor-send pattern: `createWalletClient` from the sponsor key,
  `sendTransaction`, `waitForTransactionReceipt`).
- `new GatewayClient({ chain: "arcTestnet", privateKey: eoaPrivateKey })
  .deposit(formatUnits(balance, 6))`.
- return `Number(balance)` (6-dec USDC atomic == µUSD).

### `apps/web/lib/user-wallet.ts` — `addFunding`
`addFunding(userId, microUsd, source): Promise<number>` — read current `funded_micro_usd`,
write `{ funded_micro_usd: current + microUsd, funding_status: "funded", funding_source: source }`,
return the new total. (Read-then-write; not atomic, but self-funding is user-initiated and
single-flight per user, and a capped user has no concurrent sponsored fund — acceptable.)

## Data flow

```
user (MetaMask, connected) --writeContract USDC.transfer--> spending EOA  (one popup)
  → wait receipt
  → POST /api/self-fund → depositOwnBalance(key): read EOA USDC balance → sponsor gas if needed
                          → GatewayClient.deposit(balance) → addFunding(+µUSD, 'metamask', status='funded')
  → refresh /api/wallet → balance up, fundingStatus 'funded' → spending routes proceed
```

## Error handling

| Case | Result |
|------|--------|
| Not signed in | 401 |
| `/api/self-fund` called but EOA holds 0 USDC (no transfer / not yet confirmed) | 400 "no USDC received — transfer to your spending wallet first"; no DB change |
| MetaMask transfer rejected / fails (client) | client shows the wagmi error; `/api/self-fund` never called |
| `GatewayClient.deposit` throws (gas/RPC) | 500; `funded_micro_usd` unchanged (addFunding runs only after a successful deposit). The USDC sits in the EOA; a retry deposits it |
| Double-click | second deposit sees 0 balance → 400 (or returns 0 and increments by 0); no double-count |
| User has no Arc testnet USDC in MetaMask | the transfer step has nothing to send; UI surfaces it (the faucet is the user's concern) |

## Testing

vitest, mocking viem + `@circle-fin/x402-batching/client` + `@/lib/supabase-server`:
- `depositOwnBalance`: balance `0n` → returns 0, no deposit; balance > 0 → `deposit(formatUnits)`
  called, returns the µUSD; gas sponsored only when native is low.
- `addFunding`: increments (e.g. existing 100_000 + 1_000_000 → 1_100_000), sets
  `funding_status='funded'` + `funding_source='metamask'`.
- `/api/self-fund`: 401 unauth; 0-balance → 400; funded path → `addFunding` called with the
  deposited amount, returns `{ depositedMicroUsd, fundedMicroUsd }`.
- `FetchPanel`: renders the self-fund control; clicking calls `writeContract` then (after a
  mocked receipt) `POST /api/self-fund` and refreshes balance (mock wagmi hooks + fetch).
- Keep the existing suite green.

## Out of scope

Leftover refund (funds go into the user's own Gateway balance — theirs to spend); changing
sign-in/identity; making self-fund the primary path (sponsored stays default); real geo
(Plan 3); orphan cleanup. Edge-node untouched.

## Files touched

- `apps/web/lib/self-fund.ts` — new (`depositOwnBalance`)
- `apps/web/lib/user-wallet.ts` — add `addFunding`
- `apps/web/app/api/self-fund/route.ts` — new authed route
- `apps/web/components/FetchPanel.tsx` — self-fund UI (amount + button, wagmi wiring); keep `eoaAddress`/`fundingStatus` from the wallet fetch
- `apps/web/app/globals.css` — self-fund block styles
- `apps/web/test/*` — per Testing
```
