# NanoVPN Documentation

Pay-per-use VPN / metered egress, settled as USDC nanopayments on Arc. Built for the
**Lepton Agents Hackathon** (Circle × Arc), June 15–29 2026.

## Read in this order

1. [00-hackathon-brief.md](00-hackathon-brief.md) — the event, RFBs, judging rubric,
   deadlines, and submission mechanics.
2. [01-product-vision.md](01-product-vision.md) — what we're building, for whom, and why
   it fits the rubric.
3. [02-architecture.md](02-architecture.md) — the unified architecture, components, and
   data flows.
4. [03-stack-and-tooling.md](03-stack-and-tooling.md) — Arc/Circle/x402 technical specs,
   the CLIs, SDK packages, env vars, and the organizer reference repos.
5. [04-decisions/](04-decisions/) — Architecture Decision Records (the "why" behind each
   choice).
6. [05-glossary.md](05-glossary.md) — vocabulary.
7. [specs/](specs/) — the living design spec (source of truth for what we're building
   and what's still open).

## Decision log

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](04-decisions/ADR-0001-core-framing.md) | Hybrid framing: human VPN + agent x402 egress + A2A marketplace (one core, two doors) | Accepted |
| [0002](04-decisions/ADR-0002-egress-realism.md) | Real HTTP/SOCKS proxy on 2–3 geo nodes; real USDC on Arc testnet | Accepted |
| [0003](04-decisions/ADR-0003-settlement-model.md) | Prepaid streaming USDC balance + batched nanopayments; x402 per-request for agents | Accepted |

## Build layering (scope guardrails)

- **Layer 1 (MVP — must ship for the video):** one real metered node + human map UI +
  real streaming USDC on Arc testnet + live counter.
- **Layer 2 (the agentic 30%):** buyer-side AI co-pilot (auto-select + budget) + x402
  agent egress endpoint.
- **Layer 3 (stretch):** multi-node registry + seller pricing + buyer-agent marketplace
  (A2A).
