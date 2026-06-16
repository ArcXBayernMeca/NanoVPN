# 02 — Architecture

> **Status:** the *shape* below is agreed (see ADRs). Specific tech picks marked
> _(proposed)_ are still open and tracked in
> [the design spec](specs/2026-06-16-nanovpn-design.md#open-questions).

## The core idea: one core, two front doors

Everything reduces to a single primitive:

> **A metered egress node that forwards traffic and debits USDC per unit
> (per-MB for humans, per-request for agents), streaming nanopayments via Circle Gateway
> and cutting off when payment stops.**

The human VPN, the agent x402 egress, and the A2A marketplace are not three products —
they're this one core with different clients in front of it and a shared node registry.

```
                        ┌─────────────────────────────┐
                        │        BUYER BRAIN (AI)      │
                        │  picks node · manages budget │
                        │  pause/resume · switch node  │
                        └───────┬─────────────┬────────┘
            human co-pilot mode │             │ autonomous agent mode
                                ▼             ▼
   ┌───────────────┐   ┌─────────────────┐   ┌──────────────────────┐
   │  WEB APP      │   │  Front door A    │   │  Front door B        │
   │ (Next.js)     │──▶│  Human VPN client│   │  Agent x402 endpoint │
   │ map · counter │   │ (streaming pay)  │   │ (pay-per-request)    │
   │ deposit · dash│   └────────┬─────────┘   └──────────┬───────────┘
   └───────────────┘            │                        │
                                ▼                        ▼
                        ┌─────────────────────────────────────┐
                        │        EGRESS NODE(S)                │
                        │  proxy + byte meter + payment gate   │
                        │  (2–3 real geo regions)              │
                        └───────────────┬─────────────────────┘
                                        │ signed USDC authorizations
                                        ▼
                        ┌─────────────────────────────────────┐
                        │      SETTLEMENT SERVICE              │
                        │  @circle-fin/x402-batching           │
                        │  batches → submitBatch on Arc        │
                        └───────────────┬─────────────────────┘
                                        ▼
                          Arc Testnet · USDC · Gateway
                          (settlements visible on arcscan)

   ┌─────────────────────────────────────────────────────────┐
   │  NODE REGISTRY / MARKETPLACE  (geo, price/GB, latency,    │
   │  reputation) — both buyer-brain modes shop this directory │
   └─────────────────────────────────────────────────────────┘
```

## Components (each has one clear purpose)

### 1. Egress Node — _proxy + meter + payment gate_
- **Does:** forwards client traffic to the internet; counts bytes; gates the session on
  available credit/payment; emits usage + settlement events.
- **Interface in:** client traffic (HTTP CONNECT / SOCKS5 _(proposed)_) + signed payment
  authorizations. **Interface out:** forwarded traffic; `usage` + `settlement` events.
- **Depends on:** Settlement Service, Node Registry (to advertise itself).
- **Deploy:** small VMs in 2–3 real regions _(proposed: Fly.io / Hetzner / a cloud with
  multiple regions)_.

### 2. Settlement Service — _turns usage into on-chain USDC_
- **Does:** receives signed `TransferWithAuthorization` payloads, batches them with the
  Circle Gateway batching SDK (`@circle-fin/x402-batching` → `GatewayClient`), submits
  `submitBatch` on Arc, records settlement UUIDs ↔ on-chain tx hashes.
- **Interface:** `submitPayment(auth)` → settlement record; `getSettlement(id)`.
- **Depends on:** Circle facilitator API, Arc RPC, Gateway contracts. See
  [03-stack-and-tooling.md](03-stack-and-tooling.md#x402-settlement-flow).

### 3. Node Registry / Marketplace — _the directory both brains shop_
- **Does:** lists nodes with `{geo, pricePerGB, latency, reputation, health}`.
- **MVP:** a DB table the app reads. **Stretch (Layer 3):** providers self-register, set
  prices, and a buyer-brain scores/selects across them (A2A).
- **Open:** on-chain registry vs off-chain DB — see spec open questions.

### 4. Buyer Brain — _the agentic layer (earns the 30%)_
- **Does:** selects the best node for the goal, sets/enforces a USDC budget, pauses when
  idle, switches nodes on latency/price/failure. Same logic, two adapters:
  - **Human co-pilot:** suggestions + auto-pilot inside the web app.
  - **Agent client:** an autonomous loop that consumes the x402 endpoint.
- **Depends on:** Node Registry, wallet balance, an LLM for decisions _(proposed: Claude;
  reference repo uses LangChain+OpenAI — model choice open)_.

### 5. Web App — _human front door + ops dashboard_
- **Does:** world map + node selection; wallet connect + USDC deposit; **live payment
  counter** (MB, USD spent, settled-on-chain + arcscan links); session start/stop;
  agent/marketplace dashboards.
- **Stack _(proposed)_:** Next.js (App Router) + Tailwind + shadcn/ui + a map lib; deploy
  on Vercel.

### 6. Wallet Layer — _Circle Wallets_
- **Humans _(proposed)_:** modular/passkey wallets (gasless, smooth onboarding) — pending
  [the wallet-model decision](specs/2026-06-16-nanovpn-design.md#open-questions).
- **Agents:** developer-controlled / agent wallets (`circle wallet create`).
- **Funding:** USDC into the Gateway balance (`circle gateway deposit`); testnet USDC
  from https://faucet.circle.com.

## Data flows

### A) Human VPN session (streaming balance)
1. User authenticates; wallet exists/created; USDC deposited into Gateway balance.
2. User (or co-pilot) selects a node from the Registry.
3. Client connects to the node; node opens a session against the user's credit.
4. Node meters bytes. Each threshold (e.g. every `$0.01` or `N` MB) it collects a signed
   `TransferWithAuthorization` and forwards it to the Settlement Service → batched →
   `submitBatch` on Arc.
5. Web app shows the live counter: metered spend (instant) + settled-on-chain (batched,
   with arcscan link).
6. On stop / exhausted credit, the session closes and a final batch settles.

### B) Agent egress (x402, per-request)
1. Agent (or `circle services pay`) requests the egress endpoint.
2. Endpoint returns `402 Payment Required` + price + challenge.
3. Agent signs the payment, retries with the `X-PAYMENT` header.
4. Endpoint verifies via the Circle facilitator (`/v1/x402/settle`), performs the egress,
   returns the response. Buyer-brain manages budget and node choice.

### C) A2A marketplace (stretch)
1. Provider registers a node (geo, price/GB, endpoint) in the Registry.
2. Buyer-brain queries the Registry, scores nodes (price × latency × reputation), routes.
3. Settlement flows provider-ward per byte/request; reputation updates on performance.

## Trust model (known, accepted tradeoff)
With meter-then-batch settlement there's a small unsettled window (the node meters a few
seconds/MB before settling). For the hackathon this is fine; we **cap unsettled exposure**
(e.g. settle every `$0.01`) and disclose it. Going fully trustless (payment channels) is
explicitly out of scope — see [ADR-0003](04-decisions/ADR-0003-settlement-model.md).

## How this maps to the build layers
- **Layer 1:** Components 1, 2, 5 (single node) + flow A.
- **Layer 2:** Components 4, 6 + flow B (agent x402 door + buyer-brain).
- **Layer 3:** Component 3 as a real marketplace + flow C.
