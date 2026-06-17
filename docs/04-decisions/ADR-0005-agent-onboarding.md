# ADR-0005 — Agent self-onboarding via a doc + automated Circle faucet funding

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

The agent front door (ADR-0001) has **no human "sign-up"** — an agent only needs a funded
wallet, our endpoint URL, and the ability to speak x402. We want the *join* step itself to
be agent-native: an agent should onboard by reading one document, not by a human wiring it
up. Done well, this is a direct, demonstrable hit on the hackathon's **Agentic
Sophistication (30%)** axis.

The hard part is **funding** a fresh Agent Wallet with testnet USDC. Research into Circle's
Agent Stack found that Circle exposes a **programmatic faucet** — no captcha, no human:
`circle wallet fund --address <addr> --chain ARC-TESTNET` (CLI) or `POST /v1/faucet/drips`
(API). This means an agent that already holds Circle API credentials can run
**fund → `circle gateway deposit` → `circle services pay`** fully autonomously.

(Adjacent prior art: **Proceeds / myproceeds.xyz** unifies x402 + MPP + Circle Nanopayments
and settles on Arc, but it is *seller-side monetization*, **not** an auto-funder — noted as
an optional alternative way to expose our endpoint, not part of the funding path.)

## Decision

Ship agent onboarding as a **hosted `agent-onboarding.md`** (mirrored as `llms.txt`) plus a
short **copy-paste entry prompt**. The doc walks the agent through: prerequisites →
install/auth Circle CLI → create an **Agent Wallet** (ADR-0004) → **auto-fund via Circle's
programmatic faucet** → deposit into Gateway → discover/inspect our egress endpoint →
worked first x402 request → budget/guardrail guidance → "you're live."

- **Funding = Circle's own faucet** (`circle wallet fund` / `POST /v1/faucet/drips`). We do
  **not** build a custom drip faucet for the MVP.
- **Provisioning is pre-protocol:** the agent's developer supplies Circle API credentials +
  the Agent Wallet once. Everything *after* credentials exist is automatable end-to-end.

## Consequences

- An agent self-provisions, self-funds, and makes its first paid request with **zero human
  plumbing** — the core agentic demo moment.
- Reuses Circle Agent Stack infrastructure (Circle CLI + Agent Wallets + Agent Nanopayments
  + Circle Skills) rather than custom plumbing → less to build, more tooling-score.
- **Fallbacks documented in the same doc:** (a) *Level 1* — manual Circle web faucet
  (`faucet.circle.com`) for agents without Circle CLI; (b) *optional* — a small NanoVPN
  treasury drip endpoint, kept only as backup.
- **Stretch / discovery:** list the egress endpoint in Circle's **Agent Marketplace** so
  agents `circle services search` → find NanoVPN → `circle services pay`.
- **Verify at planning:** Circle testnet faucet **rate limits**; that `circle wallet fund` /
  `POST /v1/faucet/drips` work for **Arc-Testnet** under the demo's API key.
- Drafting the actual `agent-onboarding.md` contents is deferred until after the protocol
  design is complete (per Martin, 2026-06-17).
