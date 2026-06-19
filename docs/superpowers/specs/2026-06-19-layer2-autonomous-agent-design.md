# Layer 2 — Autonomous Agent Egress Buyer (Design Spec)

> Status: **Design — approved direction, pending written-spec review** · Date: 2026-06-19
> Author: AI + Martin · Phase: post-brainstorming, pre-`writing-plans`
> Supersedes nothing; extends Layer 1 (see [Layer-1 MVP plan](../../plans/2026-06-17-layer1-mvp.md)
> and [NanoVPN design spec](../../specs/2026-06-16-nanovpn-design.md)).

## 1. Purpose

Layer 1 proved the **human** front door: a person connects through a metered HTTP-CONNECT
proxy and streams USDC nanopayments on Arc as bytes flow. Layer 2 builds the **agent**
front door and the hackathon's headline story for the **30% "Agentic Sophistication"**
score:

> An autonomous AI agent, given a one-line natural-language goal and a USDC budget,
> **reasons about which node to use, pays per request via x402 for geo-located egress, and
> completes its task** — with its reasoning, payments, and settlements visible live in the
> web app.

This is the "buyer brain *is* the client" case from the product vision. It reuses the
Layer-1 core (proxy, x402 settlement, Supabase, web shell) and adds a per-request payment
path plus an observable agent surface.

## 2. Goals & non-goals

**Goals (the MVP slice):**
- An in-repo Claude-driven agent (`apps/agent`) that takes `--goal` + `--budget`, plans
  with tool-use, and executes geo-egress requests paying USDC per request.
- A new edge-node endpoint `POST /egress` implementing **x402 per-request** payment:
  402 challenge → agent pays a flat `pricePerRequestUsd` → node proxies the URL → returns
  result + `egressIp` (the geo proof).
- Deterministic **budget guardrails** that hard-stop the agent regardless of what the LLM
  decides.
- A **mock mode** so the agent runs end-to-end with no Anthropic API key (deterministic
  fake reasoning), for CI and offline demos.
- Persisted, real-time-streamed agent activity (`agent_runs`, `agent_events`) and a web
  **`/agent` panel** that observes a run live via Supabase realtime.
- A light **agent-onboarding doc** (`agent-onboarding.md` + `llms.txt`) served by the web
  app, documenting how an external agent would self-provision a wallet and fund it.

**Non-goals (explicitly out of this slice):**
- Multi-node selection across many *real* regions (we seed 2–3 node rows that all point at
  the same proxy, so the agent's selection *reasoning* is visible; running genuinely
  separate regional proxies is future data, not code).
- ERC-8004 on-chain identity/reputation (Layer 3 stretch).
- **Live** self-funding via Circle faucet on the demo path — documented only; the agent
  runs on a **pre-funded** wallet (decision §4.2).
- Launching the agent from the web UI — the panel **observes**; launch-from-web is a
  stretch (decision §4.1).
- The human co-pilot surface (separate future slice of the same buyer-brain engine).
- Deploying Layer 2 to Fly/Vercel (carried as Layer-1 pending work).

## 3. Decisions locked (from brainstorming)

1. **Demo anchor** = autonomous agent, end-to-end, from a one-line prompt, with visible
   reasoning.
2. **Agent = our own Claude-driven Node/TS client**, in-repo — reliable and owned, not a
   third-party agent we can't control on stage.
3. **Funding = pre-funded Agent Wallet** (set up once like the Layer-1 buyer). Self-funding
   is *documented* in the onboarding doc, not live-critical.
4. **Reasoning surface = live `/agent` panel** in the web app, fed by Supabase realtime.
5. **(Confirmed 2026-06-19)** Agent runs as a **CLI**; the web panel **observes** via
   realtime. Launch-from-web = stretch.
6. **(Confirmed 2026-06-19)** Onboarding doc kept **light** — wallet + faucet documented
   for reference; live self-funding off the critical path.

## 4. Approach (chosen, with the alternatives we rejected)

### 4.1 Agent runtime: CLI + observing panel *(chosen)*
The agent is a Node CLI (`pnpm agent --goal "…" --budget 0.50`). It writes every step to
Supabase (`agent_runs` / `agent_events`). The web `/agent` panel subscribes to those tables
via Supabase realtime and renders the run as it happens.

- *Rejected: launch-from-web.* More impressive but adds an HTTP control plane, run lifecycle
  management, and failure modes we'd have to harden before the deadline. The realtime feed
  already gives us the "wow" (live reasoning) without that risk. Keep launch-from-web as a
  thin stretch (a button that shells the same CLI entrypoint) if time allows.

### 4.2 Funding: pre-funded wallet *(chosen)*
Reuse the Layer-1 funding playbook — one Agent Wallet, funded once with testnet USDC +
Gateway balance. The onboarding doc *describes* `circle wallet fund --chain ARC-TESTNET` /
`POST /v1/faucet/drips` so the story is "an agent could self-onboard," but the demo never
depends on a faucet succeeding live.

- *Rejected: live self-provisioning + faucet on the demo path.* Completes the agentic story
  but a flaky faucet on stage is an unacceptable single point of failure.

### 4.3 Payment model: x402 per-request *(chosen)*
Layer 1 settles a *streaming* balance in batched ticks. The agent path is **discrete**:
one request = one priced unit = one x402 payment. This maps cleanly to x402's
challenge/pay/fulfill shape and reuses the exact buyer `pay(url)` mechanism and the
seller's verify→settle code.

## 5. Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │  apps/agent  (Node CLI, Claude tool-use)      │
   --goal ─────► │  ┌─────────────┐   ┌──────────────────────┐  │
   --budget      │  │ buyer-brain │──►│ guardrails (budget)  │  │
                 │  │ (Anthropic  │   └──────────────────────┘  │
                 │  │  SDK / mock)│   tools:                    │
                 │  └─────────────┘    listNodes/getBalance/    │
                 │         │           payRequest(url)          │
                 └─────────┼───────────────────┬───────────────┘
                           │ writes            │ payRequest → x402 buyer
                           ▼                   ▼
                 ┌──────────────────┐  ┌─────────────────────────────┐
                 │ Supabase         │  │ apps/edge-node              │
                 │  agent_runs      │  │  POST /egress  (x402/req)   │
                 │  agent_events    │  │   402 → pay → proxy-fetch    │
                 │  settlements     │◄─┤   → {status,bytes,egressIp}  │
                 │  nodes           │  │  REUSES proxy + facilitator  │
                 └────────┬─────────┘  │  + settlements persistence   │
                          │ realtime    └─────────────────────────────┘
                          ▼
                 ┌──────────────────┐
                 │ apps/web /agent  │  observes run live (realtime)
                 │  reasoning feed  │
                 │  + payments tape │
                 └──────────────────┘
```

## 6. Components

### 6.1 `apps/agent` — the autonomous buyer (NEW)
- **What it does:** Runs a Claude tool-use loop that turns a goal + budget into a sequence
  of geo-egress requests, then reports a result. Persists every reasoning step and payment
  to Supabase.
- **Interface (CLI):** `pnpm agent --goal "<text>" --budget <usdc> [--node <id>] [--mock]`.
  Exits non-zero if the budget is exhausted before the goal completes or on fatal error.
- **Sub-units:**
  - `buyer-brain` — wraps the Anthropic SDK (model + params resolved via the `claude-api`
    skill at planning time). Pure function of (conversation, tool results) → next action.
    Has a **mock** implementation behind the same interface (deterministic scripted plan)
    used when `--mock` or no `ANTHROPIC_API_KEY`.
  - `guardrails` — deterministic, LLM-independent. Tracks cumulative spend; refuses any
    `payRequest` that would exceed `--budget`; caps total request count. The guardrail is
    the source of truth, not the model's self-control.
  - `tools` — the three tool definitions exposed to Claude:
    - `listNodes()` → reads `public.nodes` (id, city, country, price_per_request_usd).
    - `getBalance()` → current Gateway/wallet USDC balance (reuse Layer-1 balance logic).
    - `payRequest(url)` → performs one x402 purchase against edge-node `POST /egress`,
      returns `{status, bytes, egressIp}`.
  - `events` — thin writer for `agent_runs` (one row per run) and `agent_events` (one row
    per reasoning step / tool call / payment).
- **Depends on:** `@nanovpn/core` (Arc constants, pricing), the same x402 **buyer client**
  used by the Layer-1 settlement loop (`BuyerClient.pay(url)`), Supabase service-role
  client, Anthropic SDK.

### 6.2 edge-node `POST /egress` — x402 per-request seller (NEW endpoint, reuses internals)
- **What it does:** Sells a single proxied fetch for a flat `pricePerRequestUsd`. Mirrors
  the existing [`handleSettle`](../../../apps/edge-node/src/settle-endpoint.ts) flow:
  1. No `PAYMENT-SIGNATURE` header → **402** with a `PAYMENT-REQUIRED` challenge built from
     `buildRequirements(pricePerRequestUsd_in_µUSD, sellerAddress)`.
  2. With signature → `facilitator.verify` (off-chain; proves funds + intent, **no money
     moves yet**) → **proxy-fetch the target URL through this node** → only if egress is
     delivered, `facilitator.settle` (the on-chain charge). This verify→fetch→settle
     ordering *is* the refund policy (§8): the buyer is charged only for egress that
     actually happened, so a failed connection needs no reverse on-chain transfer.
  3. On settle success, persist a `settlements` row (reuse `onSettled`), tagged so the
     agent path is distinguishable from streaming sessions, and return `{status, bytes,
     egressIp}`.
- **Why reuse, not fork:** the `buildRequirements`, facilitator verify/settle, and
  settlements persistence are identical; only the *unit of value* differs (one request vs.
  unsettled metered bytes) and the *fulfillment* differs (proxy-fetch + return body vs.
  mark-settled).
- **`egressIp`** is the node's outbound IP as seen by the target — the proof the egress was
  geo-located, surfaced to the agent and the panel.
- **Security:** apply the same SSRF lockdown already added to `/api/browse` (commit
  `691ee4c`) to the `url` argument — block private/loopback/link-local ranges.
- **Depends on:** existing `proxy.ts` (for the outbound fetch), `settle-endpoint.ts`
  helpers, `sessions`/settlements persistence.

### 6.3 Supabase: `agent_runs` + `agent_events` (NEW tables)
Mirror the `settlements` realtime + public-read pattern from
[`0001_init.sql`](../../../supabase/migrations/0001_init.sql), in a new migration
`0002_agent.sql`.

- `agent_runs`: `id uuid pk`, `goal text`, `budget_micro_usd bigint`,
  `spent_micro_usd bigint default 0`, `node_id text references nodes(id)`,
  `status text check (status in ('running','succeeded','failed','budget_exhausted'))`,
  `result text`, `created_at`, `ended_at`.
- `agent_events`: `id uuid pk`, `run_id uuid references agent_runs(id)`, `seq int`,
  `kind text check (kind in ('reasoning','tool_call','payment','result','error'))`,
  `content jsonb`, `created_at`. (For `payment`, `content` references the `settlements`
  row / tx so the panel can link to it.)
- **RLS:** public **read** on both (they contain no secrets — goal text, reasoning,
  amounts, tx hashes). Writes via service-role key only (no insert policies), exactly like
  Layer 1. Add both tables to `supabase_realtime`.

### 6.4 web `/agent` panel (NEW route, reuses shell)
- **What it does:** A read-only live view. Lists recent `agent_runs`; for a selected run,
  streams its `agent_events` via Supabase realtime — a reasoning feed on one side, a
  payments/settlement tape on the other (reuse the Layer-1 `SettlementLog` styling).
- **Interface:** `/agent` (latest run) and `/agent?run=<id>`.
- **Depends on:** the existing client-safe Supabase module and the design system from the
  Layer-1 redesign (commit `7b8264a`).
- **UI process note:** per the Layer-1 retro, **set up a Playwright screenshot loop before
  iterating on this panel** — design it with eyes, not blind.

### 6.5 `agent-onboarding.md` + `llms.txt` (NEW, served by web)
- **What it does:** A light, machine-readable doc an external agent could read to learn how
  to (a) provision a Circle Agent Wallet, (b) fund it on Arc testnet (faucet command shown
  for reference), and (c) call `POST /egress` with x402. Served as static routes by the web
  app; `llms.txt` points to it.
- **Scope:** reference documentation only — nothing in the live demo depends on an external
  agent actually consuming it.

## 7. Data flow (happy path)

1. `pnpm agent --goal "Check the JP price of X" --budget 0.50`
2. Agent creates an `agent_runs` row (`status=running`).
3. buyer-brain calls `listNodes` → picks `tokyo-1` (reasoning written as an `agent_event`).
4. buyer-brain calls `payRequest(url)`:
   - guardrails check: would this exceed budget? If yes → stop, mark `budget_exhausted`.
   - x402 buyer hits `POST /egress` → 402 → signs → retries. Node verifies, **proxy-fetches**,
     and settles only on delivered egress (§6.2). If the connection fails the node returns an
     error and **no charge occurs** (§8).
   - on a charged request: one `settlements` row written; one `agent_events` row
     (`kind=payment`) written; `agent_runs.spent_micro_usd` incremented.
5. buyer-brain reasons over the returned content; repeats 4 until the goal is met or budget
   is hit.
6. Agent writes a `result` event, sets `agent_runs.status=succeeded`, exits 0.
7. Throughout, `/agent` panel renders each event live via realtime.

## 8. Error handling

- **Budget exhaustion:** guardrails hard-stop before any over-budget payment; run ends
  `budget_exhausted` with a partial result. This is a *normal* terminal state, not a crash.
- **No API key:** agent runs in mock mode (deterministic plan) — never errors for missing
  key; logs that it's mocked.
- **Connection / egress failure (the "VPN didn't work" case):** if the node **cannot
  deliver egress** — can't establish the outbound connection, DNS failure, connect timeout,
  proxy/internal error — it returns an error and **does NOT settle**, so the buyer is
  **never charged**. Because settlement is the on-chain charge and we withhold it until
  egress is delivered (verify→fetch→settle, §6.2), "refund on failure" needs no reverse
  on-chain transfer. The agent records an `error` event and may retry once or pick another
  node per guardrail policy.
- **Upstream responded (any HTTP status, incl. 4xx/5xx):** egress *was* delivered — the
  node reached the target and proxied a response — so the request **is charged** and
  returns `{status, bytes, egressIp}`. A 500 *from the destination* is a successful proxied
  request; the agent reasons about that application-level error.
- **Payment verify failure (bad/insufficient signature):** node returns 402 with reason
  (as `handleSettle` does), before any fetch; the agent records an `error` event.
- **Supabase write failure:** soft-fail the event write (log, continue) so persistence
  problems never break the actual egress/payment.

## 9. Testing strategy (TDD, matching Layer-1 discipline)

- **`apps/agent` unit tests:** guardrails (over-budget refused, request-cap enforced);
  mock buyer-brain drives a full scripted run; events writer shapes rows correctly.
- **edge-node `POST /egress` tests:** 402-without-signature; happy path
  (verify→fetch→settle) with a faked facilitator + faked upstream writes a settlements row;
  **connection failure → no settle, no settlements row** (refund policy); upstream HTTP
  error status → still charged; SSRF rejection of private URLs.
- **Integration (mock mode):** run the CLI end-to-end against a local edge-node with a fake
  facilitator → assert `agent_runs`/`agent_events`/`settlements` rows and a clean exit.
- **Live-verify (one real run):** like Layer 1, do exactly one real Arc-testnet `payRequest`
  to prove the per-request x402 path settles for real.
- Keep the existing 27 tests green.

## 10. Verify-at-planning flags (carried into `writing-plans`)

- **Anthropic model + params:** resolve exact model id and tool-use params via the
  `claude-api` skill (do not hardcode from memory).
- **`@circle-fin/x402-batching` single per-request pay:** Layer 1 only exercised the
  *streaming loop* calling `pay(url)` repeatedly. Confirm a single discrete `pay(url)`
  against `POST /egress` works as a one-shot purchase (it should — each loop iteration is
  already one independent pay).
- **Circle faucet for Arc:** confirm the faucet command/endpoint works for ARC-TESTNET so
  the onboarding doc is accurate (doc-only, not demo-critical).
- **verify→fetch→settle ordering is settleable:** confirm the facilitator accepts a
  `verify` followed (after the proxied fetch) by a `settle` on the *same* signed payload —
  i.e. holding between the two steps doesn't invalidate it. This underpins the refund
  policy (§8); if the facilitator can't split verify/settle this way, fall back to
  settle-then-best-effort-refund and flag it.
- Reconfirm the **30-day `maxTimeoutSeconds`** requirement holds for `/egress` (it shares
  `buildRequirements`, so it should — but the live facilitator is the authority).

## 11. What this explicitly does NOT include

Multi-region node fleet · ERC-8004 · live self-funding/faucet on the demo path ·
launch-from-web · human co-pilot surface · Layer-2 deployment to Fly/Vercel. These are
future slices or stretch goals, each with its own spec → plan cycle.

## 12. Reviewer decisions (resolved 2026-06-19)

1. **Charging policy:** charge **only for delivered egress**. If the connection/egress
   fails, the buyer is **not charged** — refund-by-withholding-settlement (verify→fetch→
   settle, §6.2 / §8). An upstream HTTP error status still counts as delivered egress →
   charged.
2. **Reasoning storage:** store the **full** reasoning text in `agent_events.content` (it's
   the demo's whole point and contains no secrets).
3. **Node seeding:** seed **2–3 node rows** (data-only, all pointing at the same proxy for
   the MVP) so the agent's node-selection reasoning is visibly making a choice.
