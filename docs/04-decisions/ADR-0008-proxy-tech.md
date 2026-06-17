# ADR-0008 — Egress node: HTTP CONNECT proxy in Node/TS on Fly.io (3 regions)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

The egress node is the core primitive (ADR-0001/0002): a proxy that forwards traffic,
counts bytes, and gates on payment. We need to pick a proxy protocol, how to meter, an
implementation language, and where to host real geo nodes — all under a 13-day deadline with
a small team. Both clients are HTTP-shaped (humans browsing, agents fetching URLs/APIs), and
the rest of the stack (web app, buyer-brain, settlement service) is TypeScript.

## Decision

- **Protocol — HTTP CONNECT forward proxy.** Universally supported by browsers and agent
  HTTP clients via `HTTPS_PROXY`; metering is trivial (count bytes on the tunneled TCP
  stream after CONNECT). SOCKS5 only if we later need raw non-HTTP TCP/UDP.
- **Metering — byte-counting at the stream.** Wrap the proxied connection, count bytes
  in+out per session, emit a `usage` event to the Settlement Service at the
  **$0.01-or-~10s** threshold ([ADR-0007](ADR-0007-pricing.md)). This meter drives the live
  counter.
- **Language — Node/TypeScript.** Unifies the whole stack and lets the node use Circle's JS
  SDKs directly; Node's `net`/`http` handle a CONNECT proxy comfortably at demo throughput.
  **Go reconsidered only if** a specific component clearly needs it during the build
  (per Martin, 2026-06-17) — the node↔settlement boundary is a clean HTTP interface, so a
  later swap of just the node is low-cost.
- **Hosting — Fly.io, 3 regions: Tokyo / Frankfurt / NYC.** One app, multi-region deploy,
  real geo-located IPs, minimal ops. (Hetzner cheaper but more manual; big clouds more
  setup.)

## Consequences

- Fast path to a working metered proxy that both front doors can use unchanged.
- Single-language codebase → less friction for a small team; shared types (usage events,
  pricing) reused across node, settlement, and app.
- **Honesty caveat (documented so we don't over-claim):** Fly provides **datacenter** IPs,
  not **residential** ones. Fine for demonstrating *geo-location* (IP geolocates to the city;
  geo-locked content responds accordingly), but we will **soften any "residential egress"
  language** — true residential IPs require a residential-proxy provider, out of
  scope/budget for the hackathon.
- **Verify at planning:** Fly region codes for the target cities (nrt/fra/ewr); outbound
  bandwidth limits/costs per region.
