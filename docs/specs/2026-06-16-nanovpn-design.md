# NanoVPN — Design Spec (living document)

- **Date started:** 2026-06-16
- **Status:** 🚧 **In progress** — brainstorming not yet complete. Core decisions locked;
  several areas still open (see [Open questions](#open-questions)). Do not begin
  implementation until this spec is complete and approved.
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
| Team / timeline | 2–3 people; ~13 days; Layer 1 MVP guaranteed, Layer 2 targeted, Layer 3 stretch | — |

## 5. Architecture

See [02-architecture.md](../02-architecture.md). Components: Egress Node, Settlement
Service, Node Registry/Marketplace, Buyer-Brain, Web App, Wallet Layer, x402 endpoint.

## 6. Build layers

- **Layer 1 (MVP):** 1 real metered node + human map UI + real streaming USDC + live
  counter.
- **Layer 2 (agentic 30%):** buyer-brain co-pilot + x402 agent egress endpoint.
- **Layer 3 (stretch):** multi-node registry + seller pricing + buyer-agent marketplace.

## 7. Open questions

> These must be resolved (and folded back into this spec) before we write the
> implementation plan.

1. **Branding / name** — NanoVPN vs FlowVPN vs Tollgate vs … ?
2. **Map UI** — globe vs flat world map; library (react-simple-maps / MapLibre / globe.gl);
   how the live counter + settlement stream are visualized. *(Visual companion offered;
   awaiting human.)*
3. **Buyer-brain design** — exact decisions it makes (node selection criteria, budget
   enforcement, pause/switch triggers); LLM/model choice (Claude vs the reference's
   LangChain+OpenAI); tools it gets.
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

1. Resume brainstorm on the open questions (start with branding + map UI via the visual
   companion, then buyer-brain, wallet model, registry).
2. Finalize this spec; get human approval.
3. Invoke `superpowers:writing-plans` to produce the implementation plan.
