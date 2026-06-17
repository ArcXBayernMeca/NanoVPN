# ADR-0010 — Human sign-in: pure-wallet (SIWE / passkey), email login deferred to v2

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

How does a human authenticate and get a funded balance with minimal friction? This is mostly
determined by the wallet model ([ADR-0004](ADR-0004-wallet-model.md)), which already supports
two paths (connected EOA, or Circle modular/passkey). The remaining question was whether to
add a separate email/social login on top.

## Decision

**Pure-wallet sign-in for the MVP** — the sign-in mirrors the two wallet paths, with no
password and no email:

- **"Connect wallet"** → Sign-In With Ethereum (SIWE): connect MetaMask/Privy/Rainbow, sign
  a message; the **wallet address is the identity**. Funding = deposit from the connected
  wallet.
- **"Continue with passkey"** → the Circle modular wallet's **passkey (WebAuthn) registration
  *is* the sign-in** — gasless, no seed phrase; pre-funded for the demo.

Supabase ([ADR-0009](ADR-0009-data-store.md)) stores the user record **keyed by wallet
address** (plus sessions/usage). No email/password in the MVP.

**v2 (deferred, not MVP):** optional **email / social login** via Supabase auth, for a more
web2-familiar onboarding — linked to an embedded wallet behind the scenes.

## Consequences

- Least to build; matches the two wallet paths exactly; the passkey path already serves the
  "no crypto knowledge" audience.
- **Demo script note:** lead with the **passkey** path on camera (smoothest), connected-EOA
  shown as the crypto-native alternative — a presentation choice, not architecture.
- All MVP open questions are now closed (see the design spec) — ready for spec finalization
  and the implementation plan.
