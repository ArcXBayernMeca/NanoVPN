# ADR-0002 — Egress realism: real proxy on 2–3 geo nodes, real USDC

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

"How real does the VPN need to be?" is the biggest feasibility lever for a 13-day build by
a 2–3 person team. Options ranged from a full WireGuard L3 tunnel across many regions, to
a real proxy on a few nodes, to a single real node + a simulated map, to a fully simulated
egress. The demo's persuasiveness comes from the **UX + the real on-chain payment stream**,
not from whether packets truly route through a specific city.

## Decision

Build a **real HTTP/SOCKS proxy on 2–3 real cloud nodes in different regions**, with
**real on-chain USDC settlement on Arc testnet**.

- Not a full WireGuard L3 VPN tunnel (per-byte payment-gating a tunnel is hard and would
  eat the timeline).
- Not a single-real-node + faked map (theater; risky if judges probe).
- Not fully simulated egress (weak on the "real volume" Traction axis).

## Consequences

- **Honest traction:** the proxy actually works and agent devs could really use it.
- **Natively x402:** a per-request proxy maps cleanly onto x402 (vs. a continuous tunnel).
- The world map shows the 2–3 **real** nodes as primary, and may list additional nodes as
  "coming soon" without claiming they're live.
- Proxy protocol (HTTP CONNECT vs SOCKS5) and metering implementation are still **open** —
  see the design spec.
- Region/host choice (Fly.io / Hetzner / multi-region cloud) is **open**.
