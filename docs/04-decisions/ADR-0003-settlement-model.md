# ADR-0003 — Settlement model: streaming USDC balance + x402 per request

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

A continuous VPN tunnel produces bytes constantly; an AI agent makes discrete requests.
You can't fire an on-chain transaction per megabyte — even on Arc — so "pay per use" needs
a concrete settlement mechanism. Options:

- **A. Prepaid streaming balance + batched settlement** — deposit USDC once; the node
  meters bytes locally and streams **gas-free batched nanopayments** (settle every N MB /
  few seconds) via Circle Gateway.
- **B. Pure x402 per request** — every unit is a literal `402` payment.
- **C. On-chain payment channel / escrow** — sign off-chain increments, settle net on
  close.

## Decision

**Use A for the human VPN tunnel and B (x402) for the agent door — both off one deposited
USDC balance.**

- Human tunnel: prepaid Gateway balance + **batched nanopayment** settlement
  (`@circle-fin/x402-batching` → `GatewayClient`). The UI counter shows real-time metered
  spend; the chain settles in batches right behind it. No per-MB signing prompts → smooth
  UX. This is exactly Circle's nanopayments model.
- Agent door: native **x402** per-request (`402` → sign → retry with `X-PAYMENT`).
- **Reject C (payment channels):** most trustless but the most crypto plumbing; Gateway
  batching already gives ~90% of the benefit for a fraction of the 13-day cost.

## Consequences

- Uses **Wallets + Gateway + x402 together** → maximizes the 20% Circle-tool-usage score.
- Each surface uses the rail it's actually suited to.
- **Known tradeoff:** meter-then-batch creates a small unsettled trust window (node meters
  a few seconds/MB before settling). We **cap unsettled exposure** (e.g. settle every
  `$0.01`) and disclose it. Acceptable for a hackathon; full trustlessness is out of scope.
- Pricing granularity (per-GB rate, settlement threshold) is **open** — see the spec.
