# NanoVPN

> **Pay only for the data you use.** A pay-per-use VPN / metered egress network where you pay **per megabyte in USDC** — settled as **nanopayments on Arc** — instead of a monthly subscription.

Built for the **Lepton Agents Hackathon** (Canteen × Circle × Arc, June 2026). **Testnet only.**

---

## Status

🟢 **Design complete — implementation starting.** No application code yet; the next step is building the Layer 1 MVP.

- ✅ Product & architecture designed and locked across [10 ADRs](docs/04-decisions/) and a [living design spec](docs/specs/2026-06-16-nanovpn-design.md).
- ✅ [Layer 1 MVP implementation plan](docs/plans/2026-06-17-layer1-mvp.md) written (15 TDD tasks).
- ⏭️ Up next: execute the Layer 1 plan.

---

## What we're building

NanoVPN is **one metered-egress core with two front doors**:

1. **For humans** — a NordVPN-style world map. Pick a node, connect, and watch a live USDC counter tick up as your bytes flow. No subscription; you pay for exactly the data you use, by the megabyte.
2. **For AI agents** — the same metered egress exposed as an **[x402](https://www.x402.org/)** endpoint. An agent pays USDC per request to get geo-located egress (to browse, scrape, or reach geo-restricted APIs) — no account, no API key, no card.

An AI **"buyer-brain"** sits on the buyer side: for humans it's a co-pilot that auto-selects the best node and manages the budget; for agents, it *is* the client.

## Why we're building it

Most people pay $5–12/month for a VPN they use a handful of times — airport Wi-Fi, one geo-locked stream, an occasional privacy need. Subscriptions overcharge light users and underserve "I just need it for 20 minutes" moments. Meanwhile **AI agents** increasingly need geo-located egress and have **no clean pay-as-you-go way** to buy it.

Both are the same gap: **there's been no good way to pay for bandwidth by the byte.** Nanopayments on Arc make per-byte / per-request pricing economically viable for the first time — sub-cent units, gas-free batching, sub-500ms settlement.

## How it works (in plain words)

Think of it like a **prepaid meter for internet access, paid in digital dollars.** You load a small USDC balance, connect through one of our relay nodes in another country, and money ticks down in real time as data flows. When the balance runs out, the tap closes.

Three pieces make it tick:

- **The money** — USDC (a digital dollar) moving on **Arc**, where transfers are instant and cost almost nothing. That "almost nothing" is what makes charging fractions of a cent, continuously, actually possible.
- **The meter** — each relay node counts the bytes flowing through and tallies the cost. Rather than firing a transaction per megabyte, it **batches** many tiny signed authorizations into one on-chain settlement. The receipts are real and visible on [arcscan](https://testnet.arcscan.app).
- **The brain** — an AI buyer-brain picks the best relay and watches the budget, so neither a human nor an agent has to think about any of the above.

```
                        ┌─────────────────────────────┐
                        │        BUYER BRAIN (AI)      │
                        │  picks node · manages budget │
                        └───────┬─────────────┬────────┘
            human co-pilot mode │             │ autonomous agent mode
                                ▼             ▼
   ┌───────────────┐   ┌─────────────────┐   ┌──────────────────────┐
   │  WEB APP      │   │  Front door A    │   │  Front door B        │
   │ map · counter │──▶│  Human VPN client│   │  Agent x402 endpoint │
   │ deposit       │   │ (streaming pay)  │   │ (pay-per-request)    │
   └───────────────┘   └────────┬─────────┘   └──────────┬───────────┘
                                ▼                        ▼
                        ┌─────────────────────────────────────┐
                        │   EGRESS NODE(S): proxy + byte meter │
                        │   + payment gate (real geo regions)  │
                        └───────────────┬─────────────────────┘
                                        ▼
                        ┌─────────────────────────────────────┐
                        │ SETTLEMENT: @circle-fin/x402-batching│
                        │ batches → on-chain settle on Arc     │
                        └───────────────┬─────────────────────┘
                                        ▼
                        Arc Testnet · USDC · Gateway (arcscan)
```

For the full picture see [docs/02-architecture.md](docs/02-architecture.md).

## Settlement model

- **Humans** — a prepaid streaming balance + **batched nanopayments**: the node meters bytes and streams gas-free batched settlements (~$0.01 / ~10s) so there are no per-megabyte signing prompts.
- **Agents** — native **x402** per request (`402 Payment Required` → sign → retry).

Both draw from the same USDC rails (Circle Wallets + Gateway + x402). See [ADR-0003](docs/04-decisions/ADR-0003-settlement-model.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| Chain | **Arc Testnet** (chain id `5042002`), USDC as native gas |
| Payments | Circle **Gateway** nanopayments + **x402** via `@circle-fin/x402-batching`; USDC (6-decimal ERC-20) |
| Wallets | Humans: connected EOA (SIWE) or Circle modular/passkey · Agents: Circle Agent Stack "Agent Wallet" |
| Egress node | HTTP CONNECT proxy + byte metering, **Node/TS**, on **Fly.io** (Tokyo/Frankfurt/NYC) |
| Web app | **Next.js** (App Router) + React + Tailwind + shadcn/ui + react-simple-maps, wagmi + viem · on Vercel |
| Data | **Supabase** (Postgres + auth + realtime) |
| Buyer-brain | Claude (Anthropic API) plans/explains; deterministic guardrails enforce |

## Build layers

- **Layer 1 (MVP):** one real metered node + human map UI + real streaming USDC + live counter. *The guaranteed demo.* → [plan](docs/plans/2026-06-17-layer1-mvp.md)
- **Layer 2 (agentic):** the AI buyer-brain co-pilot + the agent x402 egress endpoint + agent self-onboarding.
- **Layer 3 (stretch):** multi-node registry, seller pricing, and an **ERC-8004** trustless agent marketplace (A2A).

## Repository structure

```
docs/
├─ 00-hackathon-brief.md      # the event, rules, judging rubric, deadlines
├─ 01-product-vision.md       # what, for whom, and why
├─ 02-architecture.md         # components & data flows
├─ 03-stack-and-tooling.md    # verified Arc/Circle/x402 specs, CLIs, SDKs
├─ 04-decisions/              # ADR-0001 … ADR-0010
├─ 05-glossary.md             # nanopayment, x402, Gateway, lepton, …
├─ specs/                     # the living design spec (source of truth)
└─ plans/                     # implementation plans (Layer 1 MVP)
CLAUDE.md                     # orientation for AI agents & teammates
```

Start with [docs/README.md](docs/README.md) for the full documentation index.

## Hard constraints

- **Testnet only.** Never target mainnet. Arc chain id `5042002`.
- **USDC = 6 decimals** (`parseUnits(x, 6)`); Arc **native gas = 18 decimals**. Never mix them.
- **Secrets:** never hardcode/commit/log private keys or API keys — use `.env` (gitignored). See [.env.example](.env.example).
- **Never modify** Circle's EIP-712 type definitions / domain separators / struct hashes.

## Getting started

> Application code is being built per the [Layer 1 MVP plan](docs/plans/2026-06-17-layer1-mvp.md). Until then, this repo is documentation + plans.

Once Layer 1 lands, see the [demo runbook](docs/demo-runbook.md) (created in the final task) for setup and the <3-minute demo script. First-time tooling/auth steps are in [docs/03-stack-and-tooling.md](docs/03-stack-and-tooling.md#first-time-setup).

## Hackathon context

Lepton Agents Hackathon — **Canteen × Circle × Arc**, June 15–29 2026. NanoVPN targets all four rubric axes: **Agentic Sophistication (30%)** via the buyer-brain + agent door, **Traction (30%)**, **Tool usage (20%)** via Circle Wallets + Gateway + x402 + USDC together, and **Innovation (20%)**. See [docs/00-hackathon-brief.md](docs/00-hackathon-brief.md).

---

*Testnet demonstration project. Not a production-grade, audited, or anonymity-hardened VPN.*
