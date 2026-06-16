# ADR-0001 — Core framing: hybrid product, one core + two front doors

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

We're building for the **Lepton Agents Hackathon**, whose rubric weights **Agentic
Sophistication 30%** and **Traction 30%**. The seed idea was a consumer pay-per-use VPN
(human picks a server on a world map, pays per MB). That's a great demo and strong on
Innovation/Tooling, **but it has no AI agent in it**, forfeiting ~30% of the score in an
event literally called the *Agents* Hackathon.

We considered four framings: (A) hybrid human VPN + AI co-pilot; (B) agents-as-customers
via x402 egress; (C) agent-to-agent bandwidth marketplace; (D) pure consumer VPN.

## Decision

Build a **hybrid that unifies A + B + C**, recognizing they share one primitive:

> a metered egress node that debits USDC per unit and streams nanopayments.

So the product is **one core + two front doors + a shared registry + a buyer-brain**:
- **Front door A (humans):** world-map VPN app with a live USDC counter. *Primary demo.*
- **Front door B (agents):** the same egress as an **x402** pay-per-request endpoint.
- **Buyer-brain (AI):** picks node, manages budget, pauses/switches — co-pilot for humans,
  autonomous client for agents. *This earns the 30% agentic score.*
- **Marketplace (A2A):** the registry + seller pricing layer; a stretch goal, not a 4th
  product.

## Consequences

- We cover **all four** rubric axes instead of ~70%.
- Scope risk is real → we build in **layers** and protect the MVP (see
  [README build layering](../README.md#build-layering-scope-guardrails)).
- The human VPN tunnel and the agent door use **different rails** by design (streaming vs
  per-request) — see [ADR-0003](ADR-0003-settlement-model.md).
- Rejected **(D) pure consumer VPN**: best pure product but loses the agentic 30%.
