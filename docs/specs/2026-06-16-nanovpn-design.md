# NanoVPN — Design Spec (living document)

- **Date started:** 2026-06-16
- **Status:** 🚧 **In progress** — brainstorming not yet complete. Core decisions locked;
  several areas still open (see [Open questions](#open-questions)). Do not begin
  implementation until this spec is complete and approved.
- **⏸ Paused 2026-06-16 — RESUME HERE:** visual track done (layout/counter/brand); buyer-brain
  engine+surfaces decided and its detailed design (§5.1) **proposed, awaiting confirmation**.
  Next: confirm §5.1, then wallet & onboarding → registry → pricing → proxy tech → data store.
- **Related:** [ADR-0001](../04-decisions/ADR-0001-core-framing.md) ·
  [ADR-0002](../04-decisions/ADR-0002-egress-realism.md) ·
  [ADR-0003](../04-decisions/ADR-0003-settlement-model.md) ·
  [Architecture](../02-architecture.md)

## 1. Summary

Pay-per-use VPN / metered egress that charges **USDC per megabyte** (humans) and **per
request via x402** (agents), settled as **nanopayments on Arc**. One metered-egress core,
two front doors (human map app + agent x402 endpoint), a shared node registry, and an AI
**buyer-brain** that selects nodes and manages budget.

## 2. Goals

- Demonstrate **real** pay-per-byte/per-request bandwidth with **real on-chain USDC** on
  Arc testnet.
- Cover all four rubric axes (agentic, traction, tooling, innovation) — see
  [hackathon brief](../00-hackathon-brief.md#judging-rubric-internalize-this).
- Ship a < 3-minute demo where a live USDC counter visibly streams as data flows.

## 3. Non-goals (YAGNI)

- Production-grade/audited/anonymity-hardened VPN.
- Full WireGuard L3 tunnel across many regions.
- Trustless payment channels.
- Mainnet.

## 4. Decided (locked)

| Area | Decision | ADR |
|------|----------|-----|
| Framing | Hybrid: human VPN + agent x402 egress + A2A marketplace; one core, two doors | 0001 |
| Egress realism | Real HTTP/SOCKS proxy on 2–3 geo nodes; real USDC on Arc testnet | 0002 |
| Settlement | Prepaid streaming balance + batched nanopayments (human); x402 per-request (agent) | 0003 |
| UI / brand | Map-first (NordVPN-style) layout · right-rail counter = live ticker + arcscan settlement log · brand **NanoVPN**, USDC-green, "Pay only for the data you use." | — (visual brainstorm) |
| Buyer-brain | One decision engine, two surfaces (human co-pilot + autonomous agent client); Claude plans/explains, deterministic guardrails enforce. Detailed design §5.1 **proposed — pending confirmation**. | — |
| Team / timeline | 2–3 people; ~13 days; Layer 1 MVP guaranteed, Layer 2 targeted, Layer 3 stretch | — |

## 5. Architecture

See [02-architecture.md](../02-architecture.md). Components: Egress Node, Settlement
Service, Node Registry/Marketplace, Buyer-Brain, Web App, Wallet Layer, x402 endpoint.

### 5.1 Buyer-brain design (PROPOSED — awaiting confirmation)

> Decision locked: **one decision engine, two surfaces.** The detailed design below was
> proposed on 2026-06-16 and is awaiting Martin's confirmation before it's "locked".

- **Shared engine.** Given `{ node-registry snapshot, balance/budget, goal or preferences,
  live session metrics }` it decides: **select node → (switch / pause / resume) → stop**,
  plus spend pacing. One engine; two front doors.
- **LLM-plans / guardrails-enforce split** (this is the core of the agentic-30% story):
  - **Claude reasons** — interprets the goal ("cheapest node < 80 ms to a JP endpoint"; or
    agent: "need JP egress to fetch X under $0.50"), chooses the node, decides *when to
    change strategy*, and emits **human-readable explanations** ("Switched Tokyo→Frankfurt:
    Tokyo latency rose to 140 ms"). Visible reasoning = judges feel the AI *deciding*.
  - **Deterministic guardrails run the hot path** (no LLM in loop): hard budget cap /
    kill-switch, settle threshold, idle auto-pause, latency/failure switch triggers.
- **LLM tools** (function-calling): `listNodes(filter)`, `getBalance()`, `connect(nodeId)`,
  `disconnect()`, `setBudget()`, `pause()`, `resume()`, `getSessionMetrics()` — plus
  `payRequest(url)` (x402) on the agent surface.
- **Two surfaces, same engine:** (1) **Human co-pilot** — auto-pilots node choice with a
  live "why this node" reasoning feed, enforces budget, manual↔auto toggle. (2) **Autonomous
  agent client** — headless; takes goal + budget, runs to completion, pays x402 egress per
  request, stops at done/budget.
- **Model:** **Claude** (Anthropic API, tool-use) + a **mock mode** (no API key) for offline
  dev, mirroring the reference repo. Exact model/params pinned at planning time (consult the
  `claude-api` skill then).

## 6. Build layers

- **Layer 1 (MVP):** 1 real metered node + human map UI + real streaming USDC + live
  counter.
- **Layer 2 (agentic 30%):** buyer-brain co-pilot + x402 agent egress endpoint.
- **Layer 3 (stretch):** multi-node registry + seller pricing + buyer-agent marketplace.

## 7. Open questions

> These must be resolved (and folded back into this spec) before we write the
> implementation plan.

1. ✅ **Branding** — DECIDED: **NanoVPN** (descriptive, fintech-clean, USDC-green palette,
   tagline "Pay only for the data you use").
2. ✅ **Map UI** — DECIDED: **map-first / NordVPN-style** (flat world map dominant; right
   rail). Counter = **live ticker + on-chain settlement log** ($ increments + spend
   sparkline + arcscan-linked batch settlements). Open sub-item: map library
   (react-simple-maps / MapLibre / globe.gl).
3. 🟡 **Buyer-brain** — DECIDED: one engine, two surfaces (co-pilot + autonomous agent);
   Claude plans + explains, deterministic guardrails enforce; tool set defined (§5.1);
   mock mode without API key. **Detailed design §5.1 PROPOSED — awaiting confirmation.**
   Sub-open: exact Claude model + params (pin at planning).
4. **Circle wallet model** — modular/passkey (gasless, smooth human onboarding) vs
   user-controlled vs developer-controlled; what agents/nodes use.
5. **Node registry** — off-chain DB vs on-chain registry; data model; reputation.
6. **Proxy tech** — HTTP CONNECT vs SOCKS5; metering implementation; language (Go/Node);
   hosting/regions.
7. **Pricing** — $/GB rate; settlement threshold (unsettled-exposure cap); agent
   per-request pricing tiers.
8. **Data store** — Neon Postgres (Vercel Marketplace) vs Supabase (matches reference).
9. **Auth/onboarding** — how humans sign in and get a funded balance with minimal friction.

## 8. Risks

- **Scope creep** across three sub-products → mitigated by strict layering.
- **Unsettled trust window** in meter-then-batch → cap exposure, disclose (ADR-0003).
- **Testnet/RPC reliability** → use `arc-canteen` authenticated RPC if the public RPC is
  flaky.
- **Real proxy + payments + agent + UI in 13 days** → reuse `arc-nanopayments` and
  `circle-agent` patterns instead of building plumbing from scratch.

## 9. Next steps

**⏸ Paused 2026-06-16 (resume here).** Visual track done. Buyer-brain engine+surfaces
decided; detailed design (§5.1) proposed and **awaiting confirmation**.

1. Confirm the buyer-brain design (§5.1).
2. Resolve the remaining open questions in this order: **wallet & onboarding → node
   registry → pricing → proxy tech → data store**.
3. Finalize this spec; get human approval.
4. Invoke `superpowers:writing-plans` to produce the implementation plan.

### Setup state (done 2026-06-16)
- Both CLIs installed & authenticated on **testnet** (`circle`, `arc-canteen`).
- Arc testnet wallet `0x86f97b7afc0b580d342e824084b79ae89993ee77` funded
  (18 USDC gas + 18 USDC ERC-20).
- **Gateway nanopayment balance live: 5 USDC on Arc Testnet (domain 26).**
