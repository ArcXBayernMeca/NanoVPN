# Design — Onboarding Pilot: real per-user metered egress

**Date:** 2026-06-28
**Status:** Approved (brainstorming → spec)
**Author:** brainstormed with Martin

## Goal

Turn NanoVPN from a single-user demo (where one shared wallet pays itself through one
Tokyo node) into a small **real protocol** a stranger can use: sign in, get their own
on-chain wallet, and use a genuinely metered VPN that pays **per-use in USDC on Arc**,
where **each user is a distinct on-chain payer** and **egress geography is real**.

Two front doors over one core (humans first, then an agent), both built on the same
per-user spending wallet. This is the hackathon centerpiece (deadline 2026-07-06),
scoped ruthlessly to what is shippable and *honest* in ~9 days.

### Why (problems with today's state)

A code audit established what is real vs facade today:

- **Real:** byte metering, usage pricing, on-chain USDC settlement via the Circle
  Gateway x402 facilitator (EIP-3009), live counter + settlement tape, agent
  `verify→fetch→settle`, real internet fetch + egress-IP proof.
- **Facade:** all 9 "geo nodes" route to **one** Fly node (Tokyo) → geo is cosmetic
  (same egress IP); node `operatorAddress` = `0x0` and **all** settlements go to one
  `SELLER_ADDRESS`; the human "Start traffic" is a synthetic Cloudflare download loop;
  the **buyer is a single shared wallet** (`BUYER_PRIVATE_KEY`) that pays a seller
  address **also owned by us** (paying yourself).

The two things that make it not-a-protocol are therefore: **(a)** one shared buyer
wallet with no per-user identity/funds, and **(b)** fake geo. This pilot fixes both.

## Decisions (locked during brainstorming)

1. **Timebox:** hackathon centerpiece, ~9 days. Scope ruthlessly.
2. **Front door:** both flows, **human VPN first**; the agent is the second act. Shared
   wallet layer powers both.
3. **Identity is pluggable; funding is pluggable; both converge on one per-user
   server-side spending EOA** (the only thing that can sign streaming/autonomous x402
   settlements — see Feasibility).
   - **MetaMask path (primary, must-have):** SIWE identity, self-funded from the user's
     wallet. Scales without sponsoring; reuses existing Layer-1 SIWE.
   - **Passkey path (stretch):** Circle Modular (passkey/MSCA) identity, sponsored
     testnet grant. "Onboard in seconds, no wallet."
4. **Real geo:** deploy 2–3 real Fly regions (e.g. Tokyo / Frankfurt / NYC). Geo is
   proven via the `/egress` fetch path (no dedicated IPv4 needed; Fly egresses per
   region). Operators are still **not** real (all nodes ours, one `SELLER_ADDRESS`) —
   and the UI says so.
5. **Transport:** unify the human flow on **`/egress`** (per-request x402); **retire the
   raw HTTP-CONNECT streaming tunnel** for this pilot. Consequence: **all signing lives
   in the web layer; the edge-node never holds a user key.**
6. **Traffic realness:** an **interactive real-fetch panel** — the user routes a real
   request of their choice through a chosen region and sees the response + egress IP/geo.

### Feasibility (the spike that shaped this)

`@circle-fin/x402-batching`'s `GatewayClient` constructor calls
`privateKeyToAccount(privateKey)` — **EOA only, no custom-signer hook.** Settlement signs
an EIP-3009 `TransferWithAuthorization` and the facilitator verifies with viem's
standalone `verifyTypedData()` (**ECRECOVER-only; "Does not support Contract
Accounts"**). There is no EIP-1271 path. ⇒ a passkey **MSCA cannot be the x402 payer**,
and session keys (ERC-4337 userOps) ≠ the off-chain EIP-3009 voucher. Circle
*developer-controlled* wallets also can't plug in (they expose no raw key). **Therefore
the spending wallet is a DIY raw-key EOA we custody.** Streaming/autonomous settlement
forbids per-payment user prompts, so signing must be server-side. (Arc Testnet itself
*is* supported by all Circle wallet types; the blocker is the x402 lib, not the chain.)

## Architecture

### Two-wallet model (per user)

| | **Identity wallet** | **Spending wallet** |
|---|---|---|
| What | MetaMask address (SIWE) **or** Circle Modular passkey (MSCA) | server-custodied **EOA** (raw key, viem) |
| Role | login + stable `user_id`; never signs payments | signs all x402 settlements via the existing path |
| Funding | n/a | user transfer (MetaMask) **or** sponsored grant |

The MSCA, when used, stays lazily-deployed (never signs ⇒ never deploys ⇒ free). The
spending EOA is the universal core; identity and funding are the only things that differ
between paths.

### Wallet provisioning & funding

On first authenticated session for a `user_id` with no `user_wallets` row:

1. **Mint** a fresh EOA (viem `generatePrivateKey`/`privateKeyToAccount`), encrypt the
   key (see Custody), insert a `user_wallets` row.
2. **Fund** the EOA:
   - *MetaMask path:* prompt the user to transfer USDC from MetaMask to the spending
     EOA (**one popup**); we sponsor the EOA's native USDC-gas (tiny) for its deposit.
   - *Sponsored path:* the sponsor wallet (existing `BUYER_PRIVATE_KEY`, holds ~$38
     testnet USDC + gas + faucet) sends native gas + an ERC-20 grant (default **$0.50**).
3. **Deposit** to Gateway: the EOA `approve`s + `deposit`s into the Gateway Wallet
   (`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, testnet) — Gateway credits
   `msg.sender`, so the **EOA must deposit its own funds**.

Provision-on-signup is the baseline (brief "setting up your wallet…" state, Arc is
sub-second). **Rate-limit signups** so the sponsor can't be drained (recoverable via
faucet on testnet regardless). A pre-funded **wallet pool** (instant onboarding) is P2.

### Per-user signing (web-layer; edge-node keyless)

Both paid flows are server-side in the web app, which can decrypt the user key:

- **Human fetch:** browser → web route → web constructs
  `new GatewayClient({ chain: "arcTestnet", privateKey: <decrypted user EOA> })` and
  calls `buyer.pay(<region>/egress?url=<target>)` (reusing the exact agent x402 path) →
  node `verify→fetch→settle` → returns `{ status, bytes, egressIp, geo, snippet }`.
- **Agent:** `/api/agent/run` constructs the agent's `GatewayClient` with the
  authenticated user's EOA key instead of the shared env key.

**Gating:** both routes require an authenticated session (SIWE or passkey) and spend
**that user's** EOA, bounded by their funded balance (and `MAX_AGENT_BUDGET` for agents).
Today `/api/agent/run` is public and spends the shared wallet — this changes.

The edge-node's settlement loop / `BUYER_PRIVATE_KEY` for the human streaming path is no
longer used (raw-CONNECT retired). The edge-node keeps `/egress`, byte metering,
`fetch-public` (with its SSRF guard), and `/health`. The human live counter is now
driven by `/egress` responses (bytes returned) + settlement realtime, so the
per-session `/usage` SSE is no longer the counter source (may be removed).

### Real geo nodes

Deploy the edge-node to 2–3 Fly regions (one app, multiple machines, one bill). Repoint
2–3 `nodes` rows to real per-region `proxy_url`/`settle_url` and correct geo. `/egress`
returns the resolved `egressIp` + geo per region (already resolves egress IP at startup).
No dedicated IPv4 needed for `/egress` (HTTPS).

### Human interactive-fetch experience (`apps/web`)

After connect + funding, `/map` centers on a fetch panel: pick a region → enter/pick a
URL (presets: `ipinfo.io`, a geo-priced page, a geo-locked test) → "Fetch through
[region]". Shows status, size, a response snippet, **egress IP + resolved geo**, and the
per-fetch USDC charge (via existing `SettlementProof`). A "stream" toggle loops
fixed-size `/egress` fetches priced **proportional to bytes requested** so the per-MB
counter ticks continuously (preserving the pay-per-MB narrative within the per-request
x402 model). A *compare-regions* side-by-side ("Japan vs Germany → different IP/result")
is the "no LLM can do this" proof — **P2/stretch**.

### Key custody

Spending-EOA private keys are **AES-256-GCM encrypted at rest** (master key from env)
in `user_wallets`, **service-role only** (RLS denies all client reads). The browser
never receives a private key. Each wallet holds **< $1 testnet USDC** (worthless if
stolen; mainnet out of scope). Honest production note: real custody would use a KMS/HSM
or session delegation; AES-GCM + env key is a deliberate testnet-demo simplification.

## Data flow

```
Onboard:   session (SIWE | passkey) ──> user_wallets (mint EOA, encrypt key)
           ──> fund (MetaMask transfer | sponsored grant) ──> EOA approve+deposit → Gateway

Human fetch: browser → /api/egress (web)  ──decrypt key──> GatewayClient.pay(region/egress?url=)
             → node verify→fetch→settle → { status, bytes, egressIp, geo } + on-chain settlement (payer = user EOA)

Agent:     /api/agent/run (auth) ──decrypt key──> agent GatewayClient(user EOA)
             → reason → pay x402 per request through a real region → settle (payer = user EOA)

Display:   settlements/agent rows (payer = user EOA) ──realtime──> counter + SettlementProof
```

## Data model

New migration `0004_user_wallets.sql`:

```sql
create table user_wallets (
  user_id text primary key,                 -- siwe address (lowercased) or passkey credential/MSCA addr
  identity_type text not null,              -- 'siwe' | 'passkey'
  eoa_address text not null unique,
  encrypted_private_key text not null,      -- AES-256-GCM (iv:tag:ciphertext)
  funding_source text not null,             -- 'metamask' | 'sponsored'
  funded_micro_usd bigint not null default 0,
  spent_micro_usd bigint not null default 0,
  created_at timestamptz not null default now()
);
-- RLS: enabled, no client policies (service-role only). NOT in the realtime publication.
```

Reuse `settlements` (payer becomes the user EOA), `agent_runs`/`agent_events`. Node-row
repointing for real regions is a data change (migration `0005_real_regions.sql` or a
service-role update).

## Error handling

| Case | Result |
|------|--------|
| Funding tx (MetaMask transfer / sponsor send / deposit) fails | onboarding shows a retry; no `funded_micro_usd` credited until deposit confirms; no session spend allowed at $0 |
| User's funded balance exhausted mid-use | flows refuse new spend; friendly "balance used up" (MetaMask: top up; sponsored: optional refill) |
| `/api/egress` or `/api/agent/run` called unauthenticated | 401; no wallet decrypt, no spend |
| Decrypt fails / key missing | route 500, logged server-side; key material never returned to client |
| Region `/egress` unreachable | per-x402 design a failed fetch is **not** settled (no charge); UI shows the error |
| Sponsor wallet drained (sponsored path) | provisioning fails gracefully with a clear message; rate-limit prevents abuse |
| Gateway withdrawal delay (MetaMask leftover refund) | refund is best-effort/P2; keep grants small so leftovers are negligible |

## Testing

vitest, matching existing patterns:

- **Custody:** AES-256-GCM encrypt→decrypt round-trip; ciphertext ≠ plaintext; wrong
  key fails closed.
- **Provisioning/accounting:** new `user_id` mints exactly one row; `funded`/`spent`
  accounting; `canSpend` refuses at/over funded balance.
- **Signing:** the web buyer is constructed with the **user's** EOA (not the shared env
  key); a settlement's `payer` equals the user EOA, not `SELLER_ADDRESS`/shared buyer.
- **Gating:** unauthenticated `/api/egress` and `/api/agent/run` are rejected.
- **Geo:** human fetch returns the chosen region's `egressIp`/geo; two regions differ.
- Keep the existing suite green.

## Scope & phasing (9 days)

- **P1 (must-have centerpiece):** `user_wallets` + AES encryption + per-user web signer;
  gate agent + human fetch to the per-user EOA; **MetaMask** connect→fund→deposit;
  interactive-fetch panel; 2–3 real regions live; honest "ours, one seller" labeling.
- **P2 (stretch):** passkey/Circle-Modular onboarding; compare-regions side-by-side;
  MetaMask leftover refund; pre-funded wallet pool.

## Out of scope (explicit & honest)

MSCA session-key delegation (Approach B); real device/system or WireGuard tunnel;
**community-run nodes / independent operators / per-operator payees** (geo is real,
operators are not — stated in the UI); residential IPs / bot-block bypass (still
datacenter IPs); mainnet; passkey BIP-39 recovery; KMS/HSM custody. The on-chain
settlement mechanism itself (works) is untouched except for *which key* signs.

## Files touched (indicative; finalized in the plan)

**New**
- `supabase/migrations/0004_user_wallets.sql` — wallet table (+ `0005` region repoint)
- `packages/core/src/crypto.ts` — AES-256-GCM encrypt/decrypt helpers
- `apps/web/lib/user-wallet.ts` — provisioning (mint/encrypt/store) + decrypt-and-sign helper
- `apps/web/lib/funding.ts` — MetaMask transfer detection + sponsored grant + Gateway deposit
- `apps/web/app/api/egress/route.ts` — authed per-user human fetch (web is the x402 buyer)
- `apps/web/components/FetchPanel.tsx` — interactive real-fetch UI
- `apps/web/lib/passkey.ts` + onboarding UI — Circle Modular path (**P2**)

**Modified**
- `apps/web/app/api/agent/run/*` — gate behind session; buyer = user EOA; bound by funded balance
- `apps/web/app/map` (+ `MapRail`/connect UI) — two onboarding entries, region picker, fetch panel replacing synthetic Start-traffic (`lib/traffic.ts` / `app/api/browse` retired)
- `apps/web/components/Counter.tsx` / settlement display — per-user, from the user EOA
- `apps/edge-node` — deploy 2–3 regions; ensure `/egress` reports `egressIp`+geo; (raw-CONNECT path unused)
- existing SIWE sign-in (Layer 1) — reuse for session/`user_id` (confirm path in plan)
```
