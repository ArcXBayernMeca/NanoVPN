# NanoVPN — Design Spec (living document)

- **Date started:** 2026-06-16
- **Status:** ✅ **Design APPROVED by Martin (2026-06-17)** — all open questions resolved and
  recorded as ADRs (0001–0010). Next: `superpowers:writing-plans`. Do not begin
  implementation until the implementation plan is written and approved.
- **Related:** [Decision log — ADR-0001..0010](../README.md#decision-log) ·
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
| UI / brand | Map-first (NordVPN-style) layout · right-rail counter = live ticker + arcscan settlement log · brand **NanoVPN**, USDC-green, "Pay only for the data you use." | — (visual brainstorm) |
| Buyer-brain | One decision engine, two surfaces (human co-pilot + autonomous agent client); Claude plans/explains, deterministic guardrails enforce. Detailed design in §5.1. | §5.1 |
| Wallet model | Humans: connected EOA (MetaMask/Privy/Rainbow) **and** Circle modular/passkey wallet — both supported, one shown in demo. Agents: **Circle Agent Stack "Agent Wallet"** (agent-native developer-controlled EOA with built-in spend caps + allow/blocklists). | §5.2 |
| Agent onboarding | Self-onboarding via a hosted `agent-onboarding.md` (+ `llms.txt`): a short prompt points an agent at the doc; it self-provisions an Agent Wallet, **auto-funds from Circle's programmatic faucet**, then calls our x402 egress endpoint. | §5.2 |
| Node registry | Hybrid (C) built to migrate on-chain: off-chain two-tier model (static listing + dynamic telemetry) + **light off-chain reputation** for MVP; **ERC-8004** Identity+Reputation registries on Arc as the Layer 3 on-chain target. | §5.3 / ADR-0006 |
| Pricing | Per-node differentiated rates: humans ~$1.5–3/GB by node, agents flat sub-cent/request; settle on $0.01-or-~10s, whichever first. Exact numbers are a tuning knob. | ADR-0007 |
| Proxy tech | HTTP CONNECT forward proxy + byte-count metering, in **Node/TS**, on **Fly.io** (Tokyo/Frankfurt/NYC). Datacenter (not residential) IPs — soften "residential" claims. | ADR-0008 |
| Data store | **Supabase** (Postgres + auth + realtime); matches reference repo. Live counter streams via SSE/WS from the node; DB persists settlements + usage summaries. | ADR-0009 |
| Human sign-in | **Pure-wallet** (mirrors the wallet paths): "Connect wallet" (SIWE) or "Continue with passkey"; user keyed by wallet address in Supabase. Optional email/social login deferred to **v2**. | ADR-0010 |
| Team / timeline | 2–3 people; ~13 days; Layer 1 MVP guaranteed, Layer 2 targeted, Layer 3 stretch | — |

## 5. Architecture

See [02-architecture.md](../02-architecture.md). Components: Egress Node, Settlement
Service, Node Registry/Marketplace, Buyer-Brain, Web App, Wallet Layer, x402 endpoint.

### 5.1 Buyer-brain design (ACCEPTED 2026-06-17)

> Decision locked: **one decision engine, two surfaces**, with the detailed design below.
> (Proposed 2026-06-16; **accepted by Martin 2026-06-17**.)

- **Shared engine.** Given `{ node-registry snapshot, balance/budget, goal or preferences,
  live session metrics }` it decides: **select node → (switch / pause / resume) → stop**,
  plus spend pacing. One engine; two front doors.
- **LLM-plans / guardrails-enforce split** (this is the core of the agentic-30% story):
  - **Claude reasons** — interprets the goal ("cheapest node < 80 ms to a JP endpoint"; or
    agent: "need JP egress to fetch X under $0.50"), chooses the node, decides *when to
    change strategy*, and emits **human-readable explanations** ("Switched Tokyo→Frankfurt:
    Tokyo latency rose to 140 ms"). Visible reasoning = judges feel the AI *deciding*.
  - **Deterministic guardrails run the hot path** (no LLM in loop): hard budget cap /
    kill-switch, settle threshold, idle auto-pause, latency/failure switch triggers.
- **LLM tools** (function-calling): `listNodes(filter)`, `getBalance()`, `connect(nodeId)`,
  `disconnect()`, `setBudget()`, `pause()`, `resume()`, `getSessionMetrics()` — plus
  `payRequest(url)` (x402) on the agent surface.
- **Two surfaces, same engine:** (1) **Human co-pilot** — auto-pilots node choice with a
  live "why this node" reasoning feed, enforces budget, manual↔auto toggle. (2) **Autonomous
  agent client** — headless; takes goal + budget, runs to completion, pays x402 egress per
  request, stops at done/budget.
- **Model:** **Claude** (Anthropic API, tool-use) + a **mock mode** (no API key) for offline
  dev, mirroring the reference repo. Exact model/params pinned at planning time (consult the
  `claude-api` skill then).

### 5.2 Agent self-onboarding (DECIDED — path to take)

The agent door is **agent-native onboarding**: an agent joins by reading one doc, not by a
human wiring it up. This is itself a core Agentic-Sophistication demo artifact — a judge
watches an agent read one URL and then self-provision, self-fund, and make its first paid
request with zero human plumbing.

- **Entry prompt (copy-paste):** e.g. *"You're onboarding to NanoVPN for geo-located
  egress. Read https://nanovpn.app/agent-onboarding.md and follow it. Budget: $0.50."*
- **Hosted onboarding doc:** `agent-onboarding.md`, mirrored as `llms.txt` (agents already
  look for this). It walks the agent through: prerequisites → install/auth Circle CLI →
  create a Circle **Agent Wallet** → **auto-fund it** → discover/inspect our egress
  endpoint → worked first x402 request → budget/guardrail guidance → "you're live."
- **Funding = automated, via Circle's own programmatic faucet** (no captcha, no human):
  `circle wallet fund --address <addr> --chain ARC-TESTNET` (CLI) or `POST /v1/faucet/drips`
  (API), then `circle gateway deposit` into the Gateway balance. The agent's Circle API
  credentials + wallet provisioning are **pre-protocol** (the developer does that once), but
  every step *after* having credentials is automatable end-to-end.
  - **Fallback (Level 1):** if an agent has no Circle CLI, the doc documents the manual
    Circle web faucet path (`faucet.circle.com`).
  - **Optional (own drip):** we *can* run a small NanoVPN treasury drip endpoint, but
    Circle's faucet likely makes it unnecessary — keep as backup only.
- **Discovery tie-in (stretch):** list our egress endpoint in Circle's **Agent Marketplace**
  so agents `circle services search` → find NanoVPN → `circle services pay`.
- **Note on Proceeds (myproceeds.xyz):** a paywall layer unifying x402 + MPP + Circle
  Nanopayments (supports Arc). It is **seller-side monetization, not an auto-funder** — a
  possible *alternative way to expose our egress endpoint*, not part of the funding path.
- **Verify at planning:** Circle testnet faucet rate limits; that `circle wallet fund` /
  `POST /v1/faucet/drips` work for Arc-Testnet under the demo's API key.

### 5.3 Node registry & reputation (DECIDED — ADR-0006)

The directory both buyer-brains shop. The physical node is always off-chain; its **listing**
and **reputation** can move on-chain. Hedge: build off-chain now, target on-chain via a
standard.

- **Two-tier data model** (so the static tier migrates on-chain unchanged):
  - **Static listing** → later ERC-8004 Identity: `nodeId`, `operatorAddress`,
    `geo{country,city,lat,long}`, `endpoint`, `pricePerGB`, `pricePerRequest`, (stretch) `stake`.
  - **Dynamic telemetry** (always off-chain): `latency`, `health/uptime`,
    `currentLoad/capacity`, `lastSeen`.
  - **Reputation** = node-as-provider trust (uptime, network quality, advertised-vs-actual,
    honest metering re: the ADR-0003 trust window). **MVP: light off-chain** signal
    (rolling uptime% / success-rate); the buyer-brain scores **price × latency × health ×
    light-rep**.
- **Layer 3 stretch — on-chain via ERC-8004** (Trustless Agents, an A2A extension): deploy
  Identity + Reputation registries on Arc; nodes get an on-chain identity, the buyer-brain
  posts feedback after each session, the next one reads it before choosing. The on-chain
  target **is ERC-8004**, not a bespoke contract. Validation Registry out of scope.
- **Verify at planning:** ERC-8004 reference contracts deploy on Arc testnet (it launched on
  Ethereum mainnet, a separate L1); reference implementations to fork.

## 6. Build layers

- **Layer 1 (MVP):** 1 real metered node + human map UI + real streaming USDC + live
  counter.
- **Layer 2 (agentic 30%):** buyer-brain co-pilot + x402 agent egress endpoint.
- **Layer 3 (stretch):** multi-node registry + seller pricing + buyer-agent marketplace.

## 7. Open questions

> These must be resolved (and folded back into this spec) before we write the
> implementation plan.

1. ✅ **Branding** — DECIDED: **NanoVPN** (descriptive, fintech-clean, USDC-green palette,
   tagline "Pay only for the data you use").
2. ✅ **Map UI** — DECIDED: **map-first / NordVPN-style** (flat world map dominant; right
   rail). Counter = **live ticker + on-chain settlement log** ($ increments + spend
   sparkline + arcscan-linked batch settlements). Open sub-item: map library
   (react-simple-maps / MapLibre / globe.gl).
3. ✅ **Buyer-brain** — DECIDED: one engine, two surfaces (co-pilot + autonomous agent);
   Claude plans + explains, deterministic guardrails enforce; tool set defined (§5.1);
   mock mode without API key. Detailed design in §5.1. Sub-item (pin at planning): exact
   Claude model + params.
4. ✅ **Circle wallet model** — DECIDED. Humans: connected EOA **and** modular/passkey
   (both supported; one shown in demo). Agents: **Circle Agent Stack "Agent Wallet"**
   (agent-native developer-controlled EOA; its built-in spend caps + allow/blocklists map
   directly onto the buyer-brain guardrails). Sub-open: **verify modular/passkey wallets
   support Arc** (Gateway supports Arc testnet, but the modular-wallet chain list may not
   include Arc) — the passkey path may need to operate via the Gateway unified balance.
5. ✅ **Node registry** — DECIDED (ADR-0006, §5.3). Hybrid: off-chain two-tier model
   (static listing + dynamic telemetry) + light off-chain reputation for MVP; **ERC-8004**
   Identity+Reputation on Arc as the Layer 3 on-chain stretch. Sub-open: verify ERC-8004
   deploys on Arc testnet.
6. ✅ **Proxy tech** — DECIDED (ADR-0008). HTTP CONNECT forward proxy + byte-count metering,
   **Node/TS**, on **Fly.io** (Tokyo/Frankfurt/NYC). Go reconsidered only if a component
   needs it during build. Caveat: datacenter (not residential) IPs — soften "residential"
   claims.
7. ✅ **Pricing** — DECIDED (ADR-0007). Per-node differentiated rates (humans ~$1.5–3/GB by
   node; agents flat sub-cent/request); settle on **$0.01-or-~10s, whichever first**. Exact
   numbers are a tuning knob; what's locked is per-node differentiation + the settlement
   approach.
8. ✅ **Data store** — DECIDED (ADR-0009): **Supabase** (Postgres + auth + realtime; matches
   reference repo). Live counter streams via SSE/WS from the node; DB persists settlements +
   usage summaries.
9. ✅ **Auth/onboarding** — DECIDED. *Agent side:* self-onboarding doc (§5.2, ADR-0005).
   *Human side (ADR-0010):* **pure-wallet** sign-in — "Connect wallet" (SIWE) or "Continue
   with passkey"; user keyed by wallet address. Optional email/social login deferred to v2.

## 8. Risks

- **Scope creep** across three sub-products → mitigated by strict layering.
- **Unsettled trust window** in meter-then-batch → cap exposure, disclose (ADR-0003).
- **Testnet/RPC reliability** → use `arc-canteen` authenticated RPC if the public RPC is
  flaky.
- **Real proxy + payments + agent + UI in 13 days** → reuse `arc-nanopayments` and
  `circle-agent` patterns instead of building plumbing from scratch.

## 9. Next steps

**✅ Design APPROVED by Martin (2026-06-17).** All open questions resolved (ADR-0001..0010).

1. ✅ Spec approved by Martin (2026-06-17).
2. Invoke `superpowers:writing-plans` to produce the implementation plan.
3. Alongside planning (deferred until the protocol design was done — now done): draft the
   `agent-onboarding.md` contents (ADR-0005).

### Setup state (done 2026-06-16)
- Both CLIs installed & authenticated on **testnet** (`circle`, `arc-canteen`).
- Arc testnet wallet `0x86f97b7afc0b580d342e824084b79ae89993ee77` funded
  (18 USDC gas + 18 USDC ERC-20).
- **Gateway nanopayment balance live: 5 USDC on Arc Testnet (domain 26).**
