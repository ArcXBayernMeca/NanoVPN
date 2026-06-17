# ADR-0004 — Wallet model: connected-or-passkey for humans, Agent Wallet for agents

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

The two front doors (ADR-0001) have different signers. A **human** clicks a map and needs
the smoothest possible onboarding; an **agent** is headless software that must sign
programmatically with no human in the loop. Our settlement model (ADR-0003) draws funds
from a prepaid balance via batched nanopayments, so — whichever wallet is used — there is
always **one up-front "load the balance" signature**; you cannot meter "directly from a
wallet per byte" without spamming signature prompts.

Circle offers three wallet types (per the `circle:use-circle-wallets` guide): developer-
controlled, user-controlled, and modular/passkey. Circle's **Agent Stack** additionally
exposes an agent-purposed wallet ("Agent Wallet") built on the developer-controlled model.

## Decision

**Humans:** support **both** a connected external EOA (MetaMask / Privy / Rainbow) **and** a
Circle **modular/passkey** wallet — the demo shows one, but both code paths exist.
- Connected EOA → realistic, lightest when the wallet is already funded with Arc USDC.
- Modular/passkey → smoothest no-crypto onboarding (biometric, gasless), best Circle-tooling
  score; auto-created on sign-in and (for the demo) pre-funded.

**Agents:** use Circle **Agent Stack "Agent Wallet"** — the agent-native form of a
developer-controlled EOA. Chosen because:
- It signs **programmatically** (backend entity secret) — no human approval, which a
  passkey wallet fundamentally requires and an agent cannot provide.
- It ships with **built-in spend controls** (time-bound USDC limits for transfers *and*
  x402 services, address allow/blocklists, compliance guardrails) that map directly onto
  the buyer-brain's budget-cap / kill-switch guardrails — we get part of that layer for
  free.

## Consequences

- The two doors use **different wallet types by design**, but share the same USDC + Gateway
  + x402 rails underneath — consistent with the "one core, two doors" framing.
- Using a Circle modular wallet (human) + Agent Wallet (agent) deepens **Circle-tool usage**
  (the 20% tooling axis) on top of Gateway + x402.
- **Open / verify at planning:** the modular/passkey wallet's supported-chain list may not
  include **Arc** (Gateway *does* support Arc testnet). If passkey can't hold USDC natively
  on Arc, the passkey path operates via the **Gateway unified balance** instead. The
  connected-EOA half of the human decision is unaffected.
- See [ADR-0005](ADR-0005-agent-onboarding.md) for how the agent's Agent Wallet is
  provisioned and funded.
