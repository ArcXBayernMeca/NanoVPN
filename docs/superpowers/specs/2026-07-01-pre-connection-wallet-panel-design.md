# Design — Pre-connection wallet panel

**Date:** 2026-07-01
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Problem

On the `/map` page you can only see your balance and top up **after** you connect to a
node: the Balance line and the Fund control live inside `FetchPanel`, which
`MapRail` renders only when `session && node` (connected). So a signed-in user with a
wallet can't see how much they have — or fund — until they pick a node and connect. It
should show as soon as the wallet is signed in.

## Decisions (locked during brainstorming)

- **Show a wallet panel as soon as you're signed in** (SIWE), before/after connecting.
- It shows **two balances + the Fund control**:
  - **Wallet** — the connected MetaMask address's Arc USDC balance (your *source* funds).
  - **Spending balance** — your server-side spending EOA's Circle Gateway available balance
    (what the VPN draws from), or "syncing…" when unavailable.
  - **Fund** — the existing self-fund top-up, so you can fund before picking a node.
- **Extract a shared `WalletPanel`** (Approach A) rather than duplicate the balance/fund
  logic in the pre-connect rail. `FetchPanel` keeps only the streaming instrument.
- Labels: **"Wallet"** (MetaMask source) and **"Spending balance"** (Gateway). The Gateway
  balance polls every ~15s so it stays honest as streaming drains it.

## Architecture

### A. New `apps/web/components/WalletPanel.tsx` (client)

Owns everything wallet/funding-related (moved out of `FetchPanel`):

- **Wallet balance:** `useAccount()` for the connected address; `useReadContract({ address:
  ARC.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] })` → the MetaMask
  wallet's Arc USDC, shown via `formatUnits(balance, 6)` with the short address. If
  unreadable → "—".
- **Spending balance:** fetch `/api/wallet` → `{ eoaAddress, fundedMicroUsd, spentMicroUsd,
  gatewayMicroUsd, fundingStatus }`. Show `formatUsd(gatewayMicroUsd)` as the spending
  balance (or **"syncing…"** when `gatewayMicroUsd == null`), with "of
  `formatUsd(fundedMicroUsd)` funded" beneath. Refetch on mount, after a successful Fund,
  and on a **~15s poll** (`setInterval`, cleared on unmount).
- **Fund control:** the existing self-fund flow, verbatim in behaviour — amount input +
  Fund button; on click, `useWriteContract` `transfer(ARC.usdc, [eoaAddress,
  parseUnits(amount, 6)])` from MetaMask → `waitForTransactionReceipt` (`usePublicClient`)
  → `POST /api/self-fund` → refetch `/api/wallet`. Keeps the `> 0` amount guard and the
  error line.

### B. `apps/web/components/MapRail.tsx`

Render `<WalletPanel />` in its own `maprail__sec` **whenever `props.signedIn`** — placed
after the exit-node section, before the FetchPanel section. So it appears pre-connection
(node card + Connect + WalletPanel) and stays visible while connected (node card +
WalletPanel + FetchPanel + Disconnect). No new props needed (WalletPanel self-fetches and
uses wagmi hooks).

### C. `apps/web/components/FetchPanel.tsx`

Remove the balance line and the Fund block (now in `WalletPanel`), plus the now-unused
wallet state, `refreshWallet`, `selfFund`, and the wagmi imports (`useAccount`,
`useWriteContract`, `usePublicClient`) it only used for funding. FetchPanel keeps the
streaming instrument: STREAMING SPEND counter, egress line + verified badge, Start/Stop,
rate buttons, and the settlement tape. It no longer calls `/api/wallet`.

## Data flow

```
sign in (SIWE) → MapRail shows <WalletPanel/> (signedIn):
  Wallet     = balanceOf(ARC.usdc, connectedAddress)   [wagmi, auto-updates]
  Spending   = GET /api/wallet .gatewayMicroUsd         [mount + after-fund + 15s poll]
  Fund       = MetaMask transfer → /api/self-fund → refetch /api/wallet
pick node → Connect → FetchPanel (streaming) renders alongside the still-visible WalletPanel
```

## Error handling

| Case | Result |
|---|---|
| Not signed in | WalletPanel not rendered (rail shows the existing sign-in hint) |
| `/api/wallet` transient error | Spending balance shows "syncing…", never a fabricated number (reused behaviour) |
| MetaMask balance unreadable / no address | Wallet balance shows "—" |
| Fund: amount ≤ 0 | inline "Enter an amount greater than 0" (guard preserved) |
| Fund: deposit not confirmed | `/api/self-fund` 400 surfaces its message (unchanged) |

## Testing (vitest)

- **`WalletPanel`**: renders the Wallet balance (mock wagmi `useReadContract`) and the
  Spending balance (mock `/api/wallet`); shows "syncing…" when `gatewayMicroUsd` is `null`;
  Fund click transfers via `useWriteContract` then `POST /api/self-fund` then refetches;
  the zero-amount guard blocks the transfer and shows the error. (These self-fund /
  zero-amount / balance assertions move here from `fetch-panel.test.tsx`.)
- **`MapRail`**: renders `WalletPanel` when `signedIn` and NOT connected; still renders it
  when connected.
- **`FetchPanel`**: the streaming / egress / verified-badge tests stay green; the panel no
  longer renders a Balance line or Fund button (assert they're absent).
- Keep the rest of the web suite green.

Visual placement/readability on the dark rail is verified in the browser (Martin).

## Out of scope

The connect/disconnect flow, streaming mechanics, node selection, the copilot pick — all
unchanged. No API/route changes (`/api/wallet` and `/api/self-fund` already return what's
needed). No DB migration.

## Files touched

- `apps/web/components/WalletPanel.tsx` — new; owns Wallet + Spending balances + Fund
- `apps/web/components/MapRail.tsx` — render `<WalletPanel/>` when `signedIn`
- `apps/web/components/FetchPanel.tsx` — drop balance line + Fund block + wallet/wagmi funding code
- `apps/web/app/globals.css` — `.walletpanel__*` styles (reuse the existing dark-rail tokens; migrate the `.streampanel__bal/__sub/__fund/__amt*/__fundbtn` rules)
- `apps/web/test/walletpanel.test.tsx` — new; the moved fund / zero-amount / balance tests + syncing
- `apps/web/test/fetch-panel.test.tsx` — drop the fund/zero-amount/balance tests; keep streaming
- **Deploy:** web → Vercel (no edge-node/Fly, no DB migration)
