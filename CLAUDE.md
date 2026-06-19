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

## Current status (as of 2026-06-19)

**Phase: Layer 1 + Layer 2 BUILT, reviewed, live-verified on Arc testnet, and merged to
`main`.** Both layers went through `superpowers:brainstorming → writing-plans →
subagent-driven-development`. All 10 design decisions are locked as ADRs
(see [docs/04-decisions/](docs/04-decisions/)).

- ✅ **Layer 1 — human metered-egress MVP** (merged): wallet + SIWE sign-in, NordVPN-style
  world map, connect flow, HTTP-CONNECT proxy with byte metering, **streaming USDC
  settlement on Arc**, live counter + settlement tape. Live-verified end-to-end with a real
  on-chain settlement.
- ✅ **Layer 2 — autonomous agent egress buyer** (merged 2026-06-19): a Claude-driven CLI
  agent that, from a one-line goal + USDC budget, **reasons about which node to use and pays
  x402 per request** for geo-located egress, with deterministic budget guardrails and a mock
  mode. Adds edge-node `POST /egress` (x402 per-request, verify→fetch→settle so a failed
  connection is never charged), Supabase `agent_runs`/`agent_events` (realtime, public-read),
  and a web `/agent` observation panel. **Live-verified with real Claude reasoning + a real
  on-chain settlement on Arc.**
- ✅ Design + plan docs: Layer-1 spec [docs/specs/2026-06-16-nanovpn-design.md](docs/specs/2026-06-16-nanovpn-design.md);
  Layer-2 spec + plan under [docs/superpowers/](docs/superpowers/).

**Tests:** 65 across the monorepo (`pnpm -r test`). **Typecheck/build:** `pnpm -r build` clean.

**Remaining (stretch / ops):** deploy (edge-node → Fly, web → Vercel) per
[docs/deploy.md](docs/deploy.md); optional stretch — launch-agent-from-web, multi-region
nodes, ERC-8004 on-chain identity (Layer 3).

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
| [docs/specs/](docs/specs/) · [docs/superpowers/](docs/superpowers/) | Design specs + implementation plans |
| [docs/deploy.md](docs/deploy.md) | Fly + Vercel deploy guide |
| [packages/core/](packages/core/) | Shared Arc constants, types, µUSD pricing |
| [apps/edge-node/](apps/edge-node/) | Node/TS proxy node: HTTP-CONNECT proxy + byte meter + x402 `/settle` (streaming) & `/egress` (per-request) |
| [apps/web/](apps/web/) | Next.js app — human world-map UI, agent `/agent` panel, API routes |
| [apps/agent/](apps/agent/) | Claude-driven autonomous x402 egress-buyer CLI |
| [supabase/migrations/](supabase/migrations/) | DB schema (`0001` core, `0002` agent) |

## Build, test, run

pnpm workspace monorepo, Node ≥22, ESM throughout.

- **Install:** `pnpm install` · **Test all:** `pnpm -r test` (65 tests) · **Typecheck:** `pnpm -r build`
- **Edge-node** does NOT auto-load `.env`: `set -a; source .env; set +a; EDGE_NODE_PORT=8080 pnpm --filter @nanovpn/edge-node start`. Stop it **by port** (`lsof -ti tcp:8080 | xargs -r kill`) — never `pkill -f tsx` (it kills the shell).
- **Web:** `pnpm --filter web dev` (auto-loads `apps/web/.env.local`). If CSS edits don't appear in dev, `rm -rf apps/web/.next` (Turbopack stale-chunk).
- **Agent:** `pnpm agent --goal "…" --budget 0.02 [--node tokyo-1] [--mock]`. Needs root `.env` (`BUYER_PRIVATE_KEY`, Supabase keys, and `ANTHROPIC_API_KEY` for real reasoning; runs in mock mode with `--mock` or no key — mock still does a real on-chain settlement).
- Env vars: see [.env.example](.env.example). Supabase migrations are applied manually via the Supabase SQL editor (no CLI configured locally).

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
