# CLAUDE.md — Orientation for AI agents & teammates

> Read this first. It tells you what this project is, where things live, and the
> constraints you must respect. Then read [docs/README.md](docs/README.md) for the
> full documentation index.

## What this project is

**NanoVPN** (working title) — a **pay-per-use VPN / metered egress network** built for
the **Lepton Agents Hackathon** (Canteen × Circle × Arc, June 15–29 2026). Instead of a
monthly subscription, users pay **per megabyte of data** in **USDC**, settled as
**nanopayments on Arc** (Circle's USDC-gas L1). Payments stream in real time while
connected; the connection cuts off when the balance runs out.

The product has **two front doors over one core**:
1. **Humans** — a NordVPN-style world map; pick a node, connect, watch a live USDC
   counter tick up as bytes flow.
2. **AI agents** — the same metered egress exposed as an **x402** endpoint; an agent
   pays USDC per request to get geo-located/residential egress (to browse, scrape,
   reach geo-locked APIs).

An **AI "buyer brain"** sits on the buyer side: for humans it's a co-pilot that
auto-selects the best node and manages the budget; for agents it *is* the client. This
is what earns the hackathon's **30% "Agentic Sophistication"** score.

## Current status (as of 2026-06-16)

**Phase: brainstorming / design.** No application code yet. Decisions made so far are
recorded as ADRs. Several design areas are still open (see below).

- ✅ Core framing locked → [ADR-0001](docs/04-decisions/ADR-0001-core-framing.md)
- ✅ Egress realism locked (real proxy, 2–3 geo nodes, real USDC) → [ADR-0002](docs/04-decisions/ADR-0002-egress-realism.md)
- ✅ Settlement model locked (streaming balance + x402) → [ADR-0003](docs/04-decisions/ADR-0003-settlement-model.md)
- ⏳ **Open:** UI/map design, buyer-brain agent design, Circle wallet model, node
  registry/marketplace data model, proxy tech choice, pricing granularity. See
  "Open questions" in [the design spec](docs/specs/2026-06-16-nanovpn-design.md).

**Do not start implementation** until the design spec is complete and the human has
approved it. We are following the `superpowers:brainstorming` → `writing-plans` flow.

## Where things live

| Path | What |
|------|------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/00-hackathon-brief.md](docs/00-hackathon-brief.md) | The hackathon: rules, RFBs, judging, deadlines, links |
| [docs/01-product-vision.md](docs/01-product-vision.md) | Product vision, users, why it fits |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture, components, data flows |
| [docs/03-stack-and-tooling.md](docs/03-stack-and-tooling.md) | Arc/Circle/x402 specs, CLIs, SDKs, env vars, reference repos |
| [docs/04-decisions/](docs/04-decisions/) | Architecture Decision Records (ADRs) |
| [docs/05-glossary.md](docs/05-glossary.md) | Terms: nanopayment, x402, Gateway, lepton, etc. |
| [docs/specs/](docs/specs/) | Living design spec(s) |

## Hard constraints (read before writing any code)

- **Testnet only.** Arc is testnet-only right now. Never target mainnet. Chain ID
  `5042002`.
- **Secrets.** NEVER hardcode/commit/log private keys or API keys. Use env vars; keep
  `.env*` gitignored. See [.env.example](.env.example).
- **USDC decimals.** ERC-20 USDC on Arc uses **6 decimals** (`parseUnits(x, 6)`). Arc
  *native gas* uses 18 decimals. Do not mix them.
- **Circle EIP-712 payloads.** Never modify Circle's EIP-712 type definitions / domain
  separators / struct hashes — use them exactly as given or signatures break.
- **Deadline.** Submission closes **June 29, 2026**. Scope ruthlessly; protect the MVP
  (Layer 1) before stretch goals.

## Tooling already installed on this machine

- **Circle CLI** `circle` (v0.0.5) — wallets, Gateway, x402 `services pay`, bridge.
- **ARC CLI** `arc-canteen` (v0.1.12, at `~/.local/bin`) — authenticated Arc testnet RPC,
  context docs/samples, and **hackathon traction/product submission**.

Setup steps a human still needs to run (interactive auth) are in
[docs/03-stack-and-tooling.md](docs/03-stack-and-tooling.md#first-time-setup).

## Working agreement

- Keep docs in sync with decisions. When a decision is made, add/append an ADR and
  update the design spec's "Open questions".
- Prefer the official **Circle skills** (`circle:use-arc`, `circle:use-gateway`,
  `circle:use-usdc`, `circle:use-modular-wallets`, etc.) and the reference repos over
  guessing APIs.
- This is a collaboration between two humans + AI. Write so a fresh Claude instance can
  pick up cold from these docs.
