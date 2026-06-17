# ADR-0009 — Data store: Supabase (Postgres + auth + realtime)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Deciders:** Martin + teammate (brainstorm with Claude)

## Context

We need to persist the node registry (static listing + latest telemetry), sessions,
usage/settlement records (settlement UUID ↔ Arc tx hash), users/wallets, and the light
reputation signal ([ADR-0006](ADR-0006-node-registry.md)). Both candidates — Supabase and
Neon (Vercel Marketplace) — are Postgres and cover these needs. Tiebreakers were
reference-repo alignment, built-in auth, and developer velocity under a 13-day deadline.

## Decision

Use **Supabase** (Postgres + built-in auth + realtime + storage).

- **Matches the reference repo** (`the-canteen-dev/circle-agent`) → reuse patterns instead
  of inventing them.
- **Built-in auth** flexes to whatever we pick for human sign-in (open question #9).
- Practical: the Neon free tier was already exhausted.

## Consequences

- One service covers DB + auth (+ optional realtime/storage), reducing moving parts.
- **The live counter is NOT driven by DB realtime.** The meter ticks many times/second; we
  stream those ticks straight from the egress node to the web app over **SSE/WebSocket** and
  persist only **settlements + usage summaries** to Supabase. Supabase realtime stays a
  nice-to-have, not a dependency.
- Slight divergence from a pure Vercel-native stack (the app still deploys on Vercel; the DB
  lives in Supabase) — acceptable, env vars wire them together.
- **Verify at planning:** Supabase project on the free tier is sufficient for demo volume;
  connection pooling from Vercel serverless functions (use the pooled connection string).
