# ADR-0007 — Pricing: per-node differentiated rates + $0.01/~10s settlement threshold

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

Pricing here is partly a **demo-legibility** decision, not only economics. The demo's two
money-shots are (1) a live USDC counter visibly ticking and (2) a buyer-brain that explains
*"I picked this node because it's cheaper."* Both constrain how we price. We need: a rate
that makes USDC flow visibly, prices that **vary across nodes** (or the buyer-brain has
nothing to optimize), and a settlement cadence that keeps the on-chain log lively while
capping the meter-then-batch trust window from [ADR-0003](ADR-0003-settlement-model.md).

## Decision

- **Per-node, differentiated pricing** (not a global flat rate). Each node carries its own
  `pricePerGB` and `pricePerRequest` in its registry listing
  ([ADR-0006](ADR-0006-node-registry.md)). Price variation across nodes is what makes the
  buyer-brain's cost optimization legible.
- **Humans — per-GB**, ~**$1.5–3 / GB**, differentiated by node (e.g. Tokyo $3, NYC $2,
  Frankfurt $1.5). Plausible vs. residential-proxy market rates and enough to move the
  counter. **Tuning knob:** a slightly higher "demo rate" is allowed if the counter needs to
  pop more on screen.
- **Agents — flat per-request**, sub-cent (~**$0.001–0.01 / request**), also varying by node
  — keeps the nanopayment narrative central.
- **Settlement threshold:** settle on **whichever comes first — ~$0.01 accrued or ~10s
  elapsed.** Caps unsettled trust exposure to a penny and guarantees visible on-chain /
  arcscan activity even on low-throughput sessions.

## Consequences

- The buyer-brain has real, varying signals (price × latency × health × light-rep) to choose
  and *explain* a node — the core of the agentic demo.
- Exact rates are a **tuning knob**, easy to change; what's locked is **per-node
  differentiation** and the **$0.01/~10s settlement approach**.
- Frequent settlement → more on-chain txs (fine on Arc, gas is cheap USDC) and a livelier
  arcscan log; trust exposure bounded to ~$0.01.
