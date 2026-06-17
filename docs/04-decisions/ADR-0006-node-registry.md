# ADR-0006 — Node registry: off-chain MVP, two-tier data model, ERC-8004 on-chain stretch

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

Both buyer-brains (human co-pilot, autonomous agent) shop a **registry** of egress nodes to
pick where to connect. A node's physical machine (a VM running the proxy) is always
**off-chain** — but its *listing* and *reputation* can live on-chain. The question is how
decentralized to make this for a 13-day hackathon, and how to model the data so we don't
have to rewrite it if we get the on-chain version working.

"Reputation" here is the **node's** trustworthiness as a service provider: uptime/stability,
network quality (latency/throughput), delivering its advertised geo/price/latency, and
**honest metering** (a defense against the meter-then-batch trust window in
[ADR-0003](ADR-0003-settlement-model.md)). With 2–3 self-run nodes it barely matters; it
only becomes essential in the Layer 3 marketplace, where third parties run untrusted nodes.

**ERC-8004 "Trustless Agents"** (live on Ethereum mainnet 2026-01-29) is an extension of the
A2A protocol that adds three on-chain registries — **Identity** (ERC-721 agent passport),
**Reputation** (feedback scores + tags like uptime/latency), and **Validation** (proof of
task completion). Our Layer 3 *is* an A2A marketplace, so nodes map to service agents and
the buyer-brain maps to the feedback-leaving client agent — a 1:1 fit.

## Decision

**Hybrid (C), built to migrate to on-chain (B):**

- **MVP — off-chain registry**, modeled as **two tiers** so the static tier can later move
  on-chain unchanged:
  - **Static listing** (migratable → ERC-8004 Identity): `nodeId`, `operatorAddress`,
    `geo` `{country, city, lat, long}`, `endpoint`, `pricePerGB`, `pricePerRequest`,
    (stretch) `stake`.
  - **Dynamic telemetry** (always off-chain): `latency`, `health/uptime`,
    `currentLoad/capacity`, `lastSeen`.
  - **Reputation** (light, off-chain for MVP): a rolling `uptime% / success-rate` signal —
    the same feedback we'd later publish on-chain.
  - The buyer-brain **merges** all three when scoring (price × latency × health × light-rep).
- **Layer 3 stretch — on-chain via ERC-8004**: deploy ERC-8004 **Identity + Reputation**
  registries on Arc testnet; nodes register identities, the buyer-brain posts feedback after
  each session, the next buyer-brain reads it before choosing. The on-chain registry target
  **is ERC-8004** (a standard), not a bespoke contract. **Validation Registry is out of
  scope.**

## Consequences

- The off-chain backbone guarantees a working demo; the on-chain version is a clearly-scoped
  stretch attempted only if time allows — protecting the MVP.
- The two-tier model means MVP → on-chain is a **migration, not a rewrite**: same listing
  fields, same reputation signal, just a new home.
- Adopting ERC-8004 turns the marketplace into a **standards-based trustless A2A market** —
  strong on both Agentic Sophistication (30%) and Innovation.
- **Verify at planning:** that ERC-8004 reference contracts **deploy on Arc testnet** (Arc
  is a separate L1 from Ethereum mainnet, where it launched); availability of reference
  implementations to fork.
