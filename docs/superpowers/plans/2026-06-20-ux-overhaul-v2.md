# NanoVPN UX Overhaul v2 (Layer 2.6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Visual tasks (10, 11, 13, 14) are verified with the
> headless-Chrome screenshot loop + **frontend-design**, not unit tests.

**Goal:** Sharpen and rebuild the three web surfaces — a legible full-bleed globe map with a
translucent rail and header wallet, an autonomous-agent showcase where the AI genuinely picks
its node, and a clean "Use with your agent" onboarding page — and wire ArcScan links onto every
settlement.

**Architecture:** Keep the working core (CONNECT proxy, x402, streaming + per-request settlement,
Supabase realtime). Changes are: (a) `react-globe.gl` texture/lighting config; (b) lift wallet/SIWE
into a header context; (c) make the agent's `payRequest` node-aware so its node choice is real and
recorded; (d) a deterministic-with-Claude co-pilot picker; (e) a core `settlementUrl` builder + a
best-effort on-chain tx-hash enrichment.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript/ESM · wagmi + viem ·
`@circle-fin/x402-batching` · `@anthropic-ai/sdk` · Supabase · `react-globe.gl`/three · vitest.

## Global Constraints

- **Testnet only.** Arc chain id `5042002`. Never target mainnet.
- **Secrets:** never hardcode/commit/log private keys or API keys. `.env*` stays gitignored.
- **USDC = 6 decimals** (`parseUnits(x,6)`); Arc native gas = 18. Don't mix. Use `microUsdForRequest` from `@nanovpn/core`.
- **Never modify Circle's EIP-712 type defs / domain / struct hashes.**
- **Keep all 75 existing tests green** (core 7, edge-node 30, agent 14, web 24+1skip) and `pnpm -r build` clean.
- **Stay on `react-globe.gl`** (D7) — do not switch globe libraries.
- ESM throughout, Node ≥22, pnpm workspace. Edge-node does NOT auto-load `.env` (`set -a; source .env; set +a`). Web auto-loads `apps/web/.env.local`.
- Per-package tests: `pnpm --filter <pkg> test [path]` (script = `vitest run`). A single file: `pnpm --filter web test test/foo.test.ts`.
- Two Supabase migrations need **manual apply** by a human in the SQL editor (no CLI locally): note this in Task 3 and Task 15.

## File Structure

**New files**
- `packages/core/src/settlement.ts` — `settlementUrl()` link builder + `fetchSettlementTxHash()` best-effort enrich.
- `supabase/migrations/0003_more_nodes.sql` — 6 more nodes, differentiated prices.
- `apps/web/components/WalletProvider.tsx` — wallet/SIWE context (lifted from `ConnectBar`).
- `apps/web/components/WalletButton.tsx` — header wallet control.
- `apps/web/components/MapRail.tsx` — translucent right rail (exit node, connect, counter, tape, co-pilot).
- `apps/web/components/AgentStatusRail.tsx` — mini globe + budget gauge + payments + result.
- `apps/web/lib/copilot.ts` — `pickNodeDeterministic()` (haversine + cheapest tiebreak).
- `apps/web/app/api/copilot/pick/route.ts` — co-pilot pick endpoint (thin Claude call + fallback).
- `apps/web/app/use-with-agent/page.tsx` — onboarding page (layout A).
- `apps/web/app/developers/route.ts` — 308 redirect → `/use-with-agent`.

**Modified**
- `packages/core/src/index.ts` (export settlement helpers).
- `apps/agent/src/{tools,run,events,runner,index}.ts` (node-aware payRequest + selection recording).
- `apps/web/app/api/agent/run/route.ts` (drop nodeId).
- `apps/web/components/{SiteNav,GlobeMap,AgentRunForm,AgentFeed,SettlementLog}.tsx`, `apps/web/app/{providers,page,agent/page}.tsx`, `apps/web/app/globals.css`.
- `apps/edge-node/src/index.ts` (best-effort tx-hash enrich in `onSettled`).

**Deleted**
- `apps/web/app/developers/page.tsx` (replaced by `use-with-agent` + redirect).

---

## Task 1: Core — `settlementUrl` link builder

**Files:**
- Create: `packages/core/src/settlement.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/settlement.test.ts`

**Interfaces:**
- Consumes: `ARC`, `explorerTx`, `explorerAddr` from `./chain`.
- Produces: `settlementUrl(opts: { txHash?: string | null; address?: string | null }): string` — returns
  `explorerTx(txHash)` if a `0x…` hash is present, else `explorerAddr(address)` if an address is present,
  else `ARC.explorer`. Always an ArcScan URL.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/settlement.test.ts
import { describe, it, expect } from "vitest";
import { settlementUrl } from "../src/settlement";
import { ARC } from "../src/chain";

describe("settlementUrl", () => {
  it("links to the tx when a hash is present", () => {
    expect(settlementUrl({ txHash: "0xabc", address: "0xseller" })).toBe(`${ARC.explorer}/tx/0xabc`);
  });
  it("falls back to the address when there is no hash", () => {
    expect(settlementUrl({ txHash: null, address: "0xseller" })).toBe(`${ARC.explorer}/address/0xseller`);
  });
  it("falls back to the explorer root when neither is present", () => {
    expect(settlementUrl({})).toBe(ARC.explorer);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `pnpm --filter @nanovpn/core test test/settlement.test.ts`
Expected: FAIL — `settlementUrl` not exported.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/settlement.ts
import { ARC, explorerTx, explorerAddr } from "./chain";

/** Always resolves to an ArcScan URL: tx page when we have an on-chain hash,
 *  else the seller/payer address page, else the explorer root. */
export function settlementUrl(opts: { txHash?: string | null; address?: string | null }): string {
  if (opts.txHash) return explorerTx(opts.txHash);
  if (opts.address) return explorerAddr(opts.address);
  return ARC.explorer;
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./settlement";
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter @nanovpn/core test test/settlement.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/settlement.ts packages/core/src/index.ts packages/core/test/settlement.test.ts
git commit -m "feat(core): settlementUrl ArcScan link builder (tx → address → root fallback)"
```

---

## Task 2: Core — best-effort on-chain tx-hash enrichment + wire into edge-node

**Files:**
- Modify: `packages/core/src/settlement.ts`, `apps/edge-node/src/index.ts`
- Test: `packages/core/test/settlement.test.ts`

**Interfaces:**
- Produces: `fetchSettlementTxHash(uuid: string, opts?: { timeoutMs?: number }): Promise<string | null>` —
  GETs the facilitator transfer record and returns the first `0x[0-9a-f]{64}` it finds anywhere in the JSON,
  else `null`. Never throws (bounded timeout, swallows all errors).

- [ ] **Step 1: Write the failing test** (append to `settlement.test.ts`)

```ts
import { fetchSettlementTxHash } from "../src/settlement";

describe("fetchSettlementTxHash", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("returns the 0x hash found anywhere in the transfer record", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: { onchain: { transactionHash: "0x" + "a".repeat(64) } } }) })) as any;
    expect(await fetchSettlementTxHash("uuid-1")).toBe("0x" + "a".repeat(64));
  });
  it("returns null when no hash is present", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: "pending" }) })) as any;
    expect(await fetchSettlementTxHash("uuid-2")).toBeNull();
  });
  it("returns null (never throws) on network error", async () => {
    globalThis.fetch = (async () => { throw new Error("boom"); }) as any;
    expect(await fetchSettlementTxHash("uuid-3")).toBeNull();
  });
});
```

Add `import { describe, it, expect, afterEach } from "vitest";` (extend the existing import line).

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter @nanovpn/core test test/settlement.test.ts`
Expected: FAIL — `fetchSettlementTxHash` not exported.

- [ ] **Step 3: Implement** (append to `packages/core/src/settlement.ts`)

```ts
const HASH_RE = /0x[0-9a-f]{64}/i;

/** Best-effort: ask the facilitator for the transfer record and scrape an on-chain tx
 *  hash from it. Shape-tolerant (scans the serialized JSON). Never throws. */
export async function fetchSettlementTxHash(uuid: string, opts?: { timeoutMs?: number }): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 2500);
  try {
    const res = await fetch(`${ARC.facilitator}/v1/x402/transfers/${uuid}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const m = HASH_RE.exec(JSON.stringify(json));
    return m ? m[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter @nanovpn/core test test/settlement.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Wire into edge-node `onSettled`** — in `apps/edge-node/src/index.ts`, import and use it after the insert (best-effort, non-blocking semantics but awaited so the row is updated):

Change the import line:

```ts
import { microUsdForRequest, fetchSettlementTxHash } from "@nanovpn/core";
```

In `onSettled`, after the `settlements` insert and before/after the session update, add:

```ts
  // Best-effort: upgrade the row with the on-chain tx hash once the batch is known.
  const txHash = await fetchSettlementTxHash(settlementUuid);
  if (txHash) await db.from("settlements").update({ tx_hash: txHash }).eq("settlement_uuid", settlementUuid);
```

- [ ] **Step 5b: Verify edge-node still builds + tests green**

Run: `pnpm --filter @nanovpn/edge-node test && pnpm --filter @nanovpn/edge-node build`
Expected: 30 tests pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/settlement.ts packages/core/test/settlement.test.ts apps/edge-node/src/index.ts
git commit -m "feat(core): best-effort fetchSettlementTxHash + enrich human settlements in edge-node"
```

---

## Task 3: Supabase migration 0003 — 6 more nodes (differentiated prices)

**Files:**
- Create: `supabase/migrations/0003_more_nodes.sql`
- Test: `apps/web/test/migration-0003.test.ts`

**Interfaces:**
- Produces: 6 additional `nodes` rows (singapore-1, mumbai-1, london-1, toronto-1, sao-paulo-1, sydney-1),
  all `proxy_url`/`settle_url = http://localhost:8080[/settle]` (MVP single host), distinct
  `price_per_request_usd`. Total nodes after apply: 9.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/migration-0003.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0003_more_nodes.sql"), "utf8");

describe("0003_more_nodes.sql", () => {
  const ids = ["singapore-1", "mumbai-1", "london-1", "toronto-1", "sao-paulo-1", "sydney-1"];
  it("inserts the 6 new nodes", () => { for (const id of ids) expect(sql).toContain(`'${id}'`); });
  it("is idempotent (on conflict do nothing)", () => { expect(sql.toLowerCase()).toContain("on conflict (id) do nothing"); });
  it("uses the MVP single proxy host", () => { expect(sql).toContain("http://localhost:8080"); });
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter web test test/migration-0003.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Create the migration**

```sql
-- supabase/migrations/0003_more_nodes.sql
-- UX overhaul v2: more nodes with DIFFERENTIATED prices so "cheapest" is a real choice.
-- Same proxy host for the MVP (egress IP identical until multi-region deploy).
insert into public.nodes (id, operator_address, country, city, lat, lng, proxy_url, settle_url, price_per_gb_usd, price_per_request_usd)
values
  ('singapore-1', '0x0000000000000000000000000000000000000000', 'Singapore', 'Singapore', 1.3521, 103.8198,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0012),
  ('mumbai-1', '0x0000000000000000000000000000000000000000', 'India', 'Mumbai', 19.0760, 72.8777,
   'http://localhost:8080', 'http://localhost:8080/settle', 1.4, 0.0007),
  ('london-1', '0x0000000000000000000000000000000000000000', 'United Kingdom', 'London', 51.5072, -0.1276,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.2, 0.0013),
  ('toronto-1', '0x0000000000000000000000000000000000000000', 'Canada', 'Toronto', 43.6532, -79.3832,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0011),
  ('sao-paulo-1', '0x0000000000000000000000000000000000000000', 'Brazil', 'São Paulo', -23.5505, -46.6333,
   'http://localhost:8080', 'http://localhost:8080/settle', 1.6, 0.0009),
  ('sydney-1', '0x0000000000000000000000000000000000000000', 'Australia', 'Sydney', -33.8688, 151.2093,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.6, 0.0015)
on conflict (id) do nothing;
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter web test test/migration-0003.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit + flag manual apply**

```bash
git add supabase/migrations/0003_more_nodes.sql apps/web/test/migration-0003.test.ts
git commit -m "feat(db): migration 0003 — 6 more nodes with differentiated prices"
```

> **HUMAN STEP (before Task 15 live-verify):** paste `0003_more_nodes.sql` into the Supabase SQL editor (project `qmgyechdxhpidwvbtosl`). Local tests don't touch the live DB.

---

## Task 4: Agent — node-aware `payRequest`

**Files:**
- Modify: `apps/agent/src/tools.ts`
- Test: `apps/agent/test/tools.test.ts` (create if absent; else append)

**Interfaces:**
- Consumes: `nodesReader` returning rows incl. `id`, `proxy_url`, `price_per_request_usd`.
- Produces: `payRequest(input: { nodeId: string; url: string }) → { status, bytes, egressIp, amountMicroUsd, transaction, nodeId }`.
  `makeExecutors` no longer takes `egressBaseUrl`; it resolves `nodeId → proxy_url → ${proxy_url}/egress`
  from `nodesReader`. `TOOL_DEFS.payRequest` requires `nodeId` + `url`. `listNodes` rows unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent/test/tools.test.ts
import { describe, it, expect } from "vitest";
import { makeExecutors, TOOL_DEFS } from "../src/tools";

const NODES = [
  { id: "tokyo-1", city: "Tokyo", country: "JP", proxy_url: "http://tokyo:8080", price_per_request_usd: 0.001 },
  { id: "mumbai-1", city: "Mumbai", country: "IN", proxy_url: "http://mumbai:8080", price_per_request_usd: 0.0007 },
];

function fakeBuyer() {
  const calls: string[] = [];
  return {
    calls,
    async pay<T>(url: string) { calls.push(url); return { data: { status: 200, bytes: 1024, egressIp: "1.2.3.4" } as T, amount: 700n, transaction: "tx-1", status: 200 }; },
    async getBalances() { return { wallet: { formatted: "10" }, gateway: { formattedAvailable: "5" } }; },
  };
}

describe("payRequest is node-aware", () => {
  it("routes to the chosen node's /egress and echoes nodeId", async () => {
    const buyer = fakeBuyer();
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: buyer as any });
    const r = await ex.payRequest({ nodeId: "mumbai-1", url: "https://x.test/a" });
    expect(buyer.calls[0]).toContain("http://mumbai:8080/egress?url=");
    expect(r.nodeId).toBe("mumbai-1");
    expect(r.amountMicroUsd).toBe(700);
  });
  it("throws on an unknown node", async () => {
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: fakeBuyer() as any });
    await expect(ex.payRequest({ nodeId: "nope", url: "https://x.test/a" })).rejects.toThrow(/unknown node/);
  });
  it("declares nodeId required on the payRequest tool", () => {
    const pay = TOOL_DEFS.find((t) => t.name === "payRequest")!;
    expect(pay.input_schema.required).toEqual(expect.arrayContaining(["nodeId", "url"]));
  });
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter @nanovpn/agent test test/tools.test.ts`
Expected: FAIL — `payRequest` signature / `egressBaseUrl`.

- [ ] **Step 3: Implement** — replace the `payRequest` tool def, the `Executors`/`makeExecutors` types and body in `apps/agent/src/tools.ts`:

`TOOL_DEFS` payRequest entry:

```ts
  {
    name: "payRequest",
    description: "Pay USDC (x402) for ONE geo-located egress request through a SPECIFIC node you choose. Returns upstream HTTP status, bytes, and the node's egress IP (geo proof). Each call is one payment.",
    input_schema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The id of the node to route through (from listNodes)." },
        url: { type: "string", description: "The absolute https URL to fetch through the egress node." },
      },
      required: ["nodeId", "url"], additionalProperties: false,
    },
  },
```

`Executors.payRequest` signature:

```ts
  payRequest(input: { nodeId: string; url: string }): Promise<{ status: number; bytes: number; egressIp: string; amountMicroUsd: number; transaction: string; nodeId: string }>;
```

`makeExecutors` (drop `egressBaseUrl`; resolve per-call):

```ts
export function makeExecutors(deps: {
  nodesReader: () => Promise<{ id: string; city: string; country: string; proxy_url: string; price_per_request_usd: number }[]>;
  buyer: Buyer;
}): Executors {
  return {
    async listNodes() {
      const rows = await deps.nodesReader();
      return rows.map((n) => ({ id: n.id, city: n.city, country: n.country, pricePerRequestUsd: n.price_per_request_usd }));
    },
    async getBalance() {
      const b = await deps.buyer.getBalances();
      return { wallet: b.wallet.formatted, gatewayAvailable: b.gateway.formattedAvailable };
    },
    async payRequest({ nodeId, url }) {
      const node = (await deps.nodesReader()).find((n) => n.id === nodeId);
      if (!node) throw new Error(`unknown node ${nodeId}`);
      const res = await deps.buyer.pay<{ status: number; bytes: number; egressIp: string }>(
        `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`, { method: "POST" },
      );
      return { status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp, amountMicroUsd: Number(res.amount), transaction: res.transaction, nodeId };
    },
  };
}
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter @nanovpn/agent test test/tools.test.ts`
Expected: PASS (3 tests). (Other agent tests may fail until Task 5 — that's expected; do not "fix" them here.)

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/tools.ts apps/agent/test/tools.test.ts
git commit -m "feat(agent): node-aware payRequest({nodeId,url}) routing to the chosen node"
```

---

## Task 5: Agent — record the pick, per-node guardrail, prompt, `prepareRun` without a fixed node

**Files:**
- Modify: `apps/agent/src/events.ts`, `apps/agent/src/run.ts`, `apps/agent/src/runner.ts`
- Test: `apps/agent/test/run.test.ts` (existing), `apps/agent/test/runner.test.ts` (existing)

**Interfaces:**
- Consumes: node-aware `payRequest` (Task 4); `settlementUrl`/`fetchSettlementTxHash` (Tasks 1-2, optional enrich).
- Produces:
  - `RunWriter.setNode(nodeId: string): Promise<void>` — UPDATEs `agent_runs.node_id` (idempotent: first call wins).
  - `run.ts` calls `events.setNode(r.nodeId)` after the first successful `payRequest`.
  - `payment` event content gains `nodeId` and best-effort `txHash`.
  - `Guardrails` pre-checks against the **max** node price (conservative). `prepareRun(params: { goal, budgetUsd, mock?, nodeId? })` — `nodeId` optional (hint only).

- [ ] **Step 1: Write the failing test** — extend `apps/agent/test/run.test.ts` to assert `setNode` fires once on first payment. Add:

```ts
it("records the agent's chosen node on the first payment", async () => {
  const setNodeCalls: string[] = [];
  const events = recordingEvents(); // existing helper in this test file
  (events as any).setNode = async (id: string) => { setNodeCalls.push(id); };
  const executors = {
    listNodes: async () => [{ id: "mumbai-1", city: "Mumbai", country: "IN", pricePerRequestUsd: 0.0007 }],
    getBalance: async () => ({ wallet: "10", gatewayAvailable: "5" }),
    payRequest: async () => ({ status: 200, bytes: 10, egressIp: "1.2.3.4", amountMicroUsd: 700, transaction: "tx", nodeId: "mumbai-1" }),
  };
  const brain = new MockBrain([
    { content: [{ type: "tool_use", id: "t1", name: "payRequest", input: { nodeId: "mumbai-1", url: "https://x/a" } }], stopReason: "tool_use" },
    { content: [{ type: "text", text: "done" }], stopReason: "end_turn" },
  ]);
  await runAgent({ brain, executors: executors as any, guardrails: new Guardrails(20000, 1000), events, goal: "g" });
  expect(setNodeCalls).toEqual(["mumbai-1"]);
});
```

> If `run.test.ts`'s existing test-double `recordingEvents()` doesn't expose `setNode`, add a no-op `setNode` to it so the other tests keep compiling.

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter @nanovpn/agent test test/run.test.ts`
Expected: FAIL — `events.setNode` not called / not defined.

- [ ] **Step 3: Implement `setNode` in `events.ts`** — add to the `RunWriter` interface and the returned object:

Interface (after `runId`):

```ts
  setNode(nodeId: string): Promise<void>;
```

Returned object (add; track a local `nodeSet` flag so only the first call writes):

```ts
  let nodeSet = false;
  // ...
    async setNode(nodeId) {
      if (nodeSet) return;
      nodeSet = true;
      await db.from("agent_runs").update({ node_id: nodeId }).eq("id", opts.runId);
    },
```

- [ ] **Step 4: Implement in `run.ts`** — in the `payRequest` branch, after `await deps.events.payment(r);`, record the node:

```ts
          await deps.events.payment(r);
          await deps.events.setNode(r.nodeId);
```

Update `systemPrompt` to instruct genuine selection:

```ts
export function systemPrompt(goal: string, budgetUsd: number): string {
  return [
    "You are an autonomous egress-buyer agent for NanoVPN, a pay-per-use VPN.",
    "You complete the user's goal by paying USDC (x402) per request for geo-located egress through a node YOU choose.",
    `Your goal: ${goal}`,
    `Your hard budget: $${budgetUsd} USDC. A deterministic guardrail also enforces this — if you try to over-spend, payRequest is refused and the run ends.`,
    "Workflow: call listNodes first. Compare the nodes by how well their location fits the goal AND their per-request price, then pick ONE — state which node and why (cheapest? best region match?). Optionally getBalance. Then call payRequest({ nodeId, url }) with your chosen node for each fetch.",
    "Each payRequest is one payment and returns the upstream status, bytes, and the node's egress IP (your geo proof).",
    "When the goal is met or you are out of budget, stop and give a one-paragraph result.",
  ].join("\n");
}
```

- [ ] **Step 5: Implement in `runner.ts`** — `nodeId` optional; executors without `egressBaseUrl`; guardrail uses max node price; start with `node_id: null`; best-effort tx-hash enrich on payment.

Change the signature + body of `prepareRun`:

```ts
export interface RunParams { goal: string; budgetUsd: number; mock?: boolean; nodeId?: string; }

export async function prepareRun(params: RunParams): Promise<{ runId: string; run: () => Promise<{ status: string; result: string }> }> {
  const { goal, budgetUsd } = params;
  const mock = params.mock || !process.env.ANTHROPIC_API_KEY;
  if (!mock && !process.env.BUYER_PRIVATE_KEY) throw new Error("BUYER_PRIVATE_KEY not configured");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const nodes = (await db.from("nodes").select("id,city,country,proxy_url,price_per_request_usd")).data ?? [];
  if (nodes.length === 0) throw new Error("no nodes available");

  const priceMicroUsd = Math.max(...nodes.map((n: any) => microUsdForRequest(n.price_per_request_usd))); // conservative budget pre-check
  const budgetMicroUsd = microUsdForRequest(budgetUsd);

  const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
  const executors = makeExecutors({ nodesReader: async () => (await db.from("nodes").select("id,city,country,proxy_url,price_per_request_usd")).data ?? [], buyer: buyer as any });
  const guardrails = new Guardrails(budgetMicroUsd, priceMicroUsd);
  const runId = randomUUID();
  const events = await startRun(db as any, { runId, goal, budgetMicroUsd, nodeId: params.nodeId ?? null });

  const brain: Brain = mock
    ? new MockBrain([
        { content: [{ type: "text", text: `(mock) Comparing nodes by price; mumbai-1 is cheapest. Routing there.` }, { type: "tool_use", id: "t1", name: "payRequest", input: { nodeId: params.nodeId ?? "mumbai-1", url: "https://speed.cloudflare.com/__down?bytes=1000000" } }], stopReason: "tool_use" },
        { content: [{ type: "text", text: "(mock) Egress complete; goal satisfied." }], stopReason: "end_turn" },
      ])
    : makeAnthropicBrain({ apiKey: process.env.ANTHROPIC_API_KEY!, system: systemPrompt(goal, budgetUsd), tools: TOOL_DEFS, effort: process.env.AGENT_EFFORT ?? "medium" });

  return { runId, run: () => runAgent({ brain, executors, guardrails, events, goal }) };
}
```

> Note: the conservative max-price pre-check means a budget must cover at least one max-price request; this is correct (never overspends) and fine for demo budgets ($0.02 ≫ $0.0015).

For the **payment tx-hash enrich** (best-effort), do it in `events.ts` `payment` (so both CLI + web get it). Update `payment` to accept an optional `nodeId`/`txHash` already in `p` and enrich:

```ts
import { fetchSettlementTxHash } from "@nanovpn/core";
// ...
    async payment(p) {
      const txHash = await fetchSettlementTxHash(p.transaction);
      await event("payment", { ...p, txHash });
      spent += p.amountMicroUsd;
      await db.from("agent_runs").update({ spent_micro_usd: spent }).eq("id", opts.runId);
    },
```

And widen the `payment` type in `RunWriter` to include `nodeId`:

```ts
  payment(p: { amountMicroUsd: number; transaction: string; status: number; bytes: number; egressIp: string; nodeId: string }): Promise<void>;
```

- [ ] **Step 6: Run the whole agent suite; fix only what these changes touched**

Run: `pnpm --filter @nanovpn/agent test`
Expected: all agent tests pass (the existing `runner.test.ts` mock-DB double may need `proxy_url` added to its node rows and a `select` that ignores columns — update the test double, not production, to match the new `select`). Record the count.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/events.ts apps/agent/src/run.ts apps/agent/src/runner.ts apps/agent/test/run.test.ts apps/agent/test/runner.test.ts
git commit -m "feat(agent): record the AI's real node pick, per-node guardrail, tx-hash enrich, optional nodeId"
```

---

## Task 6: Agent CLI — make `--node` optional

**Files:**
- Modify: `apps/agent/src/index.ts`

**Interfaces:** Consumes `prepareRun({ goal, budgetUsd, mock, nodeId? })` (Task 5). No test (thin arg-parse wrapper; covered by build + live run).

- [ ] **Step 1: Implement** — replace the node line + the `prepareRun` call:

```ts
  const goal = arg("goal");
  const budgetUsd = Number(arg("budget", "0.5"));
  const nodeId = process.argv.includes("--node") ? arg("node") : undefined; // omit → the agent picks
  const mock = hasFlag("mock");
  const { runId, run } = await prepareRun({ goal, budgetUsd, nodeId, mock });
  console.log(`[agent] run ${runId} — goal=${JSON.stringify(goal)} budget=$${budgetUsd} node=${nodeId ?? "(agent picks)"} mock=${mock || !process.env.ANTHROPIC_API_KEY}`);
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @nanovpn/agent build`
Expected: tsc clean.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/index.ts
git commit -m "feat(agent): --node is now optional (omit → the agent picks)"
```

---

## Task 7: Web — `POST /api/agent/run` drops `nodeId`

**Files:**
- Modify: `apps/web/app/api/agent/run/route.ts`
- Test: `apps/web/test/agent-run-route.test.ts` (existing)

**Interfaces:** body becomes `{ goal: string; budgetUsd: number; mock?: boolean }`. Calls `prepareRun({ goal, budgetUsd, mock })`.

- [ ] **Step 1: Update the test** — change the existing route test so it no longer sends/asserts `nodeId`, and asserts a valid body still returns `{ runId }`. (Open `agent-run-route.test.ts`; remove `nodeId` from the mocked `prepareRun` args + request body.) Add a case: missing goal → 400.

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter web test test/agent-run-route.test.ts`
Expected: FAIL (route still reads/validates nodeId).

- [ ] **Step 3: Implement** — in `route.ts`, drop the `nodeId` line and the validation, and the `prepareRun` arg:

```ts
  const goal = String(body?.goal ?? "").trim();
  const budgetUsd = Number(body?.budgetUsd);
  const mock = Boolean(body?.mock);
  if (!goal || !(budgetUsd > 0)) {
    return NextResponse.json({ error: "goal and budgetUsd>0 are required" }, { status: 400 });
  }
  try {
    const { runId, run } = await prepareRun({ goal, budgetUsd, mock });
    after(async () => { try { await run(); } catch (e) { console.error("[agent-run]", (e as Error).message); } });
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter web test test/agent-run-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/agent/run/route.ts apps/web/test/agent-run-route.test.ts
git commit -m "feat(web): /api/agent/run drops nodeId (agent picks the node)"
```

---

## Task 8: Web — AgentRunForm without the node dropdown

**Files:**
- Modify: `apps/web/components/AgentRunForm.tsx`
- Test: `apps/web/test/agent-run-form.test.tsx` (existing)

**Interfaces:** Form fields = goal, budget, mock. POST body `{ goal, budgetUsd, mock }`.

- [ ] **Step 1: Update the test** — assert the form renders the goal input + budget + a Run button and **no `<select>`**. Add:

```tsx
it("has no node dropdown (the agent picks)", () => {
  const { container } = render(<AgentRunForm />);
  expect(container.querySelector("select")).toBeNull();
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter web test test/agent-run-form.test.tsx`
Expected: FAIL (select still present).

- [ ] **Step 3: Implement** — remove `nodes`/`nodeId` state, the `useEffect` fetch of nodes, the `<select>`, and `nodeId` from the body:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AgentRunForm() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("0.02");
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budgetUsd: Number(budget), mock }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "failed"); return; }
      router.push(`/agent?run=${data.runId}`);
    } finally { setBusy(false); }
  }

  return (
    <form className="run-form" onSubmit={submit}>
      <input className="run-form__goal" placeholder="Goal — e.g. fetch a product price from a Japan-only store"
        value={goal} onChange={(e) => setGoal(e.target.value)} required />
      <div className="run-form__row">
        <input className="run-form__budget" type="number" step="0.01" min="0.0001" value={budget}
          onChange={(e) => setBudget(e.target.value)} aria-label="budget (USD)" />
        <label className="run-form__mock"><input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> mock</label>
        <button className="btn btn--primary" disabled={busy || !goal}>{busy ? "Starting…" : "Run agent ▸"}</button>
      </div>
      {err && <p className="hint" style={{ color: "var(--amber)" }}>{err}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter web test test/agent-run-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/AgentRunForm.tsx apps/web/test/agent-run-form.test.tsx
git commit -m "feat(web): AgentRunForm drops the node dropdown (goal + budget + mock)"
```

---

## Task 9: Web — wallet/SIWE in the header

**Files:**
- Create: `apps/web/components/WalletProvider.tsx`, `apps/web/components/WalletButton.tsx`
- Modify: `apps/web/app/providers.tsx`, `apps/web/components/SiteNav.tsx`, `apps/web/app/page.tsx`
- Test: `apps/web/test/wallet-label.test.ts`

**Interfaces:**
- Produces: `useWallet(): { address?: string; signedIn: string | null; busy: boolean; connect(): void; signIn(): Promise<void>; disconnect(): void }`,
  `<WalletProvider>` (wraps children inside Wagmi), `<WalletButton/>` (header control), and a pure
  `walletLabel(address?: string, signedIn?: string | null): string`.
- Consumes: existing `buildSiweMessage` from `@/lib/siwe`; wagmi hooks.
- Map page reads `useWallet().signedIn` instead of local `signedIn` + `<ConnectBar>`.

- [ ] **Step 1: Write the failing test** (pure label helper — the testable seam)

```ts
// apps/web/test/wallet-label.test.ts
import { describe, it, expect } from "vitest";
import { walletLabel } from "@/components/WalletProvider";

describe("walletLabel", () => {
  it("prompts to connect when no address", () => { expect(walletLabel(undefined, null)).toBe("Connect wallet"); });
  it("prompts to sign in when connected but not signed", () => { expect(walletLabel("0x1234567890abcdef", null)).toBe("Sign in as 0x1234…cdef"); });
  it("shows the short address when signed in", () => { expect(walletLabel("0x1234567890abcdef", "0x1234567890abcdef")).toBe("0x1234…cdef"); });
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter web test test/wallet-label.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WalletProvider.tsx`** (lift ConnectBar's logic into a context):

```tsx
"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { buildSiweMessage } from "@/lib/siwe";

export function walletLabel(address?: string, signedIn?: string | null): string {
  if (!address) return "Connect wallet";
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return signedIn ? short : `Sign in as ${short}`;
}

interface WalletCtx { address?: string; signedIn: string | null; busy: boolean; connect(): void; signIn(): Promise<void>; disconnect(): void; }
const Ctx = createContext<WalletCtx | null>(null);
export const useWallet = () => { const c = useContext(Ctx); if (!c) throw new Error("useWallet outside WalletProvider"); return c; };

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // reset SIWE state if the wallet disconnects/changes
  useEffect(() => { if (!isConnected) setSignedIn(null); }, [isConnected]);

  async function signIn() {
    if (!address) return;
    setBusy(true);
    try {
      const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
      const message = buildSiweMessage({ address, nonce, domain: window.location.host, uri: window.location.origin });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const data = (await res.json()) as { address?: string };
      if (data.address) setSignedIn(data.address);
    } finally { setBusy(false); }
  }

  return (
    <Ctx.Provider value={{ address, signedIn, busy, connect: () => connect({ connector: injected() }), signIn, disconnect: () => setSignedIn(null) }}>
      {children}
    </Ctx.Provider>
  );
}
```

- [ ] **Step 4: Implement `WalletButton.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useWallet, walletLabel } from "./WalletProvider";

export function WalletButton() {
  const { address, signedIn, busy, connect, signIn } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // avoid SSR/client wallet-state hydration mismatch
  if (!mounted) return <button className="btn btn--ghost" disabled>Connect wallet</button>;
  if (!address) return <button className="btn btn--primary" onClick={connect}>Connect wallet</button>;
  if (signedIn) return <span className="wallet-chip"><span className="live" /> {walletLabel(address, signedIn)}</span>;
  return <button className="btn btn--primary" disabled={busy} onClick={signIn}>{busy ? "Signing…" : walletLabel(address, null)}</button>;
}
```

- [ ] **Step 5: Wire the provider** — `apps/web/app/providers.tsx`, wrap children:

```tsx
import { WalletProvider } from "@/components/WalletProvider";
// ...
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}><WalletProvider>{children}</WalletProvider><Toaster /></QueryClientProvider>
    </WagmiProvider>
```

- [ ] **Step 6: Put the button in the header** — `apps/web/components/SiteNav.tsx` (keep it a server component rendering the client button):

```tsx
import Link from "next/link";
import { WalletButton } from "./WalletButton";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <nav className="sitenav__links">
        <Link href="/">Map</Link>
        <Link href="/agent">Agent</Link>
        <Link href="/use-with-agent">Use with agent</Link>
      </nav>
      <div className="sitenav__right">
        <span className="netpill"><span className="dot" /> Arc testnet</span>
        <WalletButton />
      </div>
    </header>
  );
}
```

> The `/use-with-agent` link target is created in Task 14; until then it 404s. (Acceptable mid-plan;
> Task 14 follows immediately.)

- [ ] **Step 7: Consume the context in the map page** — `apps/web/app/page.tsx`: remove the local `signedIn` state + `<ConnectBar>` import/usage; read `signedIn` from `useWallet()`. Replace the wallet `<section>` with nothing (wallet now lives in the header), and gate Connect on `signedIn`:

```tsx
import { useWallet } from "@/components/WalletProvider";
// inside Page(): remove `const [signedIn, setSignedIn] = useState...`
const { signedIn } = useWallet();
// remove the entire `<section className="panel__sec">…Wallet…<ConnectBar/></section>` block.
// `connect()` already checks `if (!selected || !signedIn) return;` — unchanged.
```

- [ ] **Step 8: Run tests + build**

Run: `pnpm --filter web test test/wallet-label.test.ts && pnpm --filter web build`
Expected: label test PASS; next build clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/WalletProvider.tsx apps/web/components/WalletButton.tsx apps/web/app/providers.tsx apps/web/components/SiteNav.tsx apps/web/app/page.tsx apps/web/test/wallet-label.test.ts
git commit -m "feat(web): lift wallet/SIWE into a header WalletButton (shared context)"
```

---

## Task 10: Web — globe texture + lighting fix

**Files:**
- Modify: `apps/web/components/GlobeMap.tsx`, `apps/web/app/globals.css`

**VISUAL TASK — no unit test.** Verify with `pnpm --filter web build` + the screenshot loop (Task 15). Use **frontend-design** for polish. Props unchanged: `{ nodes, selectedId, connected, streaming, onSelect }`.

- [ ] **Step 1: Apply the research-verified config** — in `GlobeMap.tsx`, change the `<Globe>` props:

```tsx
          globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png"
          showAtmosphere
          atmosphereColor="#39ff14"
          atmosphereAltitude={0.18}
```

(Remove the old `globeImageUrl="…earth-dark.jpg"` and `backgroundColor` line.)

- [ ] **Step 2: Brighten the material + relief in `handleReady`** — after `const c = g.controls();` block, add:

```tsx
    const m = g.globeMaterial?.();
    if (m) { m.bumpScale = 10; m.shininess = 15; }
```

- [ ] **Step 3: Bolder pins** — bump the point styling so nodes read clearly:

```tsx
          pointColor={(d: any) => (d.selected ? "#aaffcc" : "#39ff14")}
          pointAltitude={(d: any) => (d.selected ? 0.18 : 0.1)}
          pointRadius={(d: any) => (d.selected ? 1.0 : 0.7)}
```

- [ ] **Step 4: Build to confirm it compiles**

Run: `pnpm --filter web build`
Expected: clean (Globe loads client-only; build does not render WebGL).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/GlobeMap.tsx apps/web/app/globals.css
git commit -m "feat(web): legible blue-marble globe (bump + brighter lights + neon-green atmosphere + bolder pins)"
```

---

## Task 11: Web — map layout A (full-bleed globe + right glass rail)

**Files:**
- Create: `apps/web/components/MapRail.tsx`
- Modify: `apps/web/app/page.tsx`, `apps/web/components/SettlementLog.tsx`, `apps/web/app/globals.css`

**VISUAL TASK** — verify via build + screenshot loop (Task 15) with **frontend-design**.

**Interfaces:** `MapRail` props `{ node, signedIn, session, connecting, streaming, intensity, onConnect, onDisconnect, onToggleStream, onIntensity, onCopilot }`. `SettlementLog` rows link via `settlementUrl`.

- [ ] **Step 1: ArcScan link in `SettlementLog.tsx`** — add `payee` to the `Row` type and the link:

```tsx
import { settlementUrl } from "@nanovpn/core";
interface Row { id: string; settlement_uuid: string; amount_micro_usd: number; status: string; tx_hash: string | null; payee: string; }
// the <a> href becomes:
                href={settlementUrl({ txHash: r.tx_hash, address: r.payee })}
```

(Remove the old `ARC.explorer`/`ARC.facilitator` ternary + the now-unused `ARC` import if nothing else uses it.)

- [ ] **Step 2: Create `MapRail.tsx`** — the translucent panel (exit node → connect → counter → tape → co-pilot). Move the rail markup out of `page.tsx` into this component (reuse existing `Counter`, `SettlementLog`, class names + the `.glass`-style classes added in Step 4):

```tsx
"use client";
import type { NodeListing } from "@nanovpn/core";
import { Counter } from "./Counter";
import { SettlementLog } from "./SettlementLog";
import type { Intensity } from "@/lib/traffic";

export function MapRail(props: {
  node: NodeListing | null; signedIn: string | null; session: { sessionId: string } | null;
  connecting: boolean; streaming: boolean; intensity: Intensity; copilotMsg: string | null;
  onConnect(): void; onDisconnect(): void; onToggleStream(): void; onIntensity(i: Intensity): void; onCopilot(): void;
}) {
  const { node, signedIn, session } = props;
  return (
    <aside className="maprail">
      <section className="maprail__sec">
        <span className="eyebrow">Exit node</span>
        {node ? (
          <div className="node-card"><span className="node-card__pin" />
            <div><div className="node-card__name">{node.geo.city}, {node.geo.country}</div><div className="node-card__meta">{node.id}</div></div>
            <span className="node-card__rate">${node.pricePerGbUsd}/GB</span>
          </div>
        ) : <p className="hint">Spin the globe and pick a node — or let the AI choose.</p>}
        {props.copilotMsg && <p className="hint copilot-msg">✦ {props.copilotMsg}</p>}
        {!session && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <button className="btn btn--primary" disabled={!node || !signedIn || props.connecting} onClick={props.onConnect}>
              {props.connecting ? "Connecting…" : node ? `Connect to ${node.geo.city}` : "Connect"}
            </button>
            <button className="btn btn--ghost copilot-btn" disabled={!signedIn} onClick={props.onCopilot}>✦ Let AI pick for me</button>
            {!signedIn && <p className="hint">Sign in with your wallet (top right) to connect.</p>}
          </div>
        )}
      </section>
      {session && node && (
        <>
          <section className="maprail__sec">
            <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} />
            <div className="stream-controls">
              <button className={`btn ${props.streaming ? "btn--ghost" : "btn--primary"}`} onClick={props.onToggleStream}>{props.streaming ? "Stop traffic" : "Start traffic"}</button>
              <div className="seg" role="group" aria-label="intensity">
                {(["light", "medium", "heavy"] as Intensity[]).map((i) => (
                  <button key={i} className="seg__btn" data-on={props.intensity === i} onClick={() => props.onIntensity(i)}>{i}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={props.onDisconnect}>Disconnect</button>
          </section>
          <section className="maprail__sec">
            <span className="eyebrow">On-chain settlements</span>
            <SettlementLog sessionId={session.sessionId} />
          </section>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 2b: Rewrite `page.tsx`** to the full-bleed stage + `MapRail` (globe fills the stage, rail floats over it). Keep all existing state/handlers; add a `copilotMsg` state + an `onCopilot` stub that Task 12 fills in:

```tsx
  // add: const [copilotMsg, setCopilotMsg] = useState<string | null>(null);
  // add a placeholder handler (Task 12 implements the real fetch):
  async function copilotPick() { /* implemented in Task 12 */ }
  // JSX:
  return (
    <div className="map-stage">
      <div className="map-globe">
        <GlobeMap nodes={nodes} selectedId={selected} connected={!!session}
          streaming={streaming ? intensity : null} onSelect={(id) => { if (!session) setSelected(id); }} />
      </div>
      <MapRail node={node} signedIn={signedIn} session={session} connecting={connecting}
        streaming={streaming} intensity={intensity} copilotMsg={copilotMsg}
        onConnect={connect} onDisconnect={disconnect} onToggleStream={() => setStreaming((s) => !s)}
        onIntensity={setIntensity} onCopilot={copilotPick} />
    </div>
  );
```

- [ ] **Step 3: CSS** — in `globals.css`, add the immersive stage + glass rail (full viewport minus header; rail floats top-right; translucent):

```css
.map-stage { position: relative; height: calc(100vh - var(--nav-h, 56px)); width: 100%; overflow: hidden; }
.map-globe { position: absolute; inset: 0; }
.maprail { position: absolute; top: 18px; right: 18px; width: 300px; max-height: calc(100% - 36px); overflow: auto;
  background: rgba(10,16,12,.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 16px; color: var(--ink, #e7efe9); }
.maprail__sec + .maprail__sec { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1); }
.copilot-btn { width: 100%; } .copilot-msg { color: #7ff0aa; }
```

(Define `--nav-h` on `.sitenav` height if not already; adjust to match the real header height.)

- [ ] **Step 4: Build**

Run: `pnpm --filter web build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/MapRail.tsx apps/web/components/SettlementLog.tsx apps/web/app/page.tsx apps/web/app/globals.css
git commit -m "feat(web): map layout A — full-bleed globe + translucent rail + ArcScan settlement links"
```

---

## Task 12: Web — co-pilot "Let AI pick for me"

**Files:**
- Create: `apps/web/lib/copilot.ts`, `apps/web/app/api/copilot/pick/route.ts`
- Modify: `apps/web/app/page.tsx`
- Test: `apps/web/test/copilot.test.ts`

**Interfaces:**
- Produces: `pickNodeDeterministic(loc: {lat:number;lng:number} | null, nodes: NodeListing[]): { nodeId: string; reason: string }`
  — nearest by haversine; if `loc` is null, cheapest `$/GB`; ties → cheapest. `POST /api/copilot/pick {lat?,lng?}` → `{ nodeId, reason }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/copilot.test.ts
import { describe, it, expect } from "vitest";
import { pickNodeDeterministic } from "@/lib/copilot";

const N = (id: string, lat: number, lng: number, gb: number): any => ({ id, geo: { lat, lng, city: id, country: "" }, pricePerGbUsd: gb, pricePerRequestUsd: gb / 1000 });
const nodes = [N("tokyo-1", 35.7, 139.7, 1.8), N("london-1", 51.5, -0.1, 2.2), N("nyc-1", 40.7, -74, 2.4)];

describe("pickNodeDeterministic", () => {
  it("picks the nearest node to the user", () => {
    expect(pickNodeDeterministic({ lat: 48.9, lng: 2.3 }, nodes).nodeId).toBe("london-1"); // Paris → London
  });
  it("falls back to cheapest $/GB when location is unknown", () => {
    expect(pickNodeDeterministic(null, nodes).nodeId).toBe("tokyo-1");
  });
});
```

- [ ] **Step 2: Run; verify it fails**

Run: `pnpm --filter web test test/copilot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/copilot.ts`**

```ts
import type { NodeListing } from "@nanovpn/core";

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pickNodeDeterministic(loc: { lat: number; lng: number } | null, nodes: NodeListing[]): { nodeId: string; reason: string } {
  if (nodes.length === 0) throw new Error("no nodes");
  if (!loc) {
    const cheapest = [...nodes].sort((a, b) => a.pricePerGbUsd - b.pricePerGbUsd)[0];
    return { nodeId: cheapest.id, reason: `Cheapest available at $${cheapest.pricePerGbUsd}/GB.` };
  }
  const nearest = [...nodes].sort((a, b) => haversine(loc, a.geo) - haversine(loc, b.geo))[0];
  return { nodeId: nearest.id, reason: `Closest to you (${nearest.geo.city}) for low latency.` };
}
```

- [ ] **Step 4: Run; verify it passes**

Run: `pnpm --filter web test test/copilot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the route** — `apps/web/app/api/copilot/pick/route.ts` (thin single Claude call; deterministic fallback on missing key / parse failure / error):

```ts
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseService } from "@/lib/supabase-server";
import { pickNodeDeterministic } from "@/lib/copilot";
import type { NodeListing } from "@nanovpn/core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { lat, lng } = await req.json().catch(() => ({}));
  const loc = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  const db = supabaseService();
  const { data } = await db.from("nodes").select("id,city,country,lat,lng,price_per_gb_usd,price_per_request_usd");
  const nodes: NodeListing[] = (data ?? []).map((n: any) => ({ id: n.id, operatorAddress: "", geo: { city: n.city, country: n.country, lat: n.lat, lng: n.lng }, proxyUrl: "", settleUrl: "", pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd }));
  if (nodes.length === 0) return NextResponse.json({ error: "no nodes" }, { status: 503 });

  const fallback = () => NextResponse.json(pickNodeDeterministic(loc, nodes));
  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const list = nodes.map((n) => `${n.id}: ${n.geo.city} ($${n.pricePerGbUsd}/GB)`).join("; ");
    const res = await client.messages.create({
      model: "claude-opus-4-8", max_tokens: 200,
      system: "Pick the single best NanoVPN exit node for a human's browsing. Prefer geographic closeness to the user, then lower $/GB. Reply ONLY with strict JSON: {\"nodeId\":\"<id>\",\"reason\":\"<one short sentence>\"}.",
      messages: [{ role: "user", content: `User location: ${loc ? `${loc.lat},${loc.lng}` : "unknown"}. Nodes: ${list}.` }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!nodes.some((n) => n.id === parsed.nodeId)) return fallback();
    return NextResponse.json({ nodeId: parsed.nodeId, reason: String(parsed.reason ?? "Best fit for you.") });
  } catch {
    return fallback();
  }
}
```

- [ ] **Step 6: Wire the button** — in `apps/web/app/page.tsx`, implement `copilotPick`:

```tsx
  async function copilotPick() {
    setCopilotMsg("Asking the AI to choose…");
    const loc = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 4000 });
    });
    const res = await fetch("/api/copilot/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loc ?? {}) }).then((r) => r.json()).catch(() => null);
    if (res?.nodeId) { setSelected(res.nodeId); setCopilotMsg(res.reason ?? null); }
    else setCopilotMsg("Couldn't pick automatically — choose a node on the globe.");
  }
```

- [ ] **Step 7: Run copilot test + build**

Run: `pnpm --filter web test test/copilot.test.ts && pnpm --filter web build`
Expected: PASS + clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/copilot.ts apps/web/app/api/copilot/pick/route.ts apps/web/app/page.tsx apps/web/test/copilot.test.ts
git commit -m "feat(web): co-pilot 'Let AI pick for me' (Claude pick + deterministic fallback)"
```

---

## Task 13: Web — agent showcase layout A (status rail + restyle)

**Files:**
- Create: `apps/web/components/AgentStatusRail.tsx`
- Modify: `apps/web/app/agent/page.tsx`, `apps/web/components/AgentFeed.tsx`, `apps/web/app/globals.css`
- Test: `apps/web/test/agent-feed.test.tsx` (existing — keep green)

**VISUAL TASK** — verify via build + screenshot loop with **frontend-design**.

**Interfaces:** `AgentStatusRail` props `{ runId, nodeId, spentMicroUsd, budgetMicroUsd, status, nodes }` — renders a non-interactive mini `GlobeMap` (chosen node lit), budget gauge, payments (realtime, ArcScan links via `settlementUrl` using the chosen node's `operatorAddress`), result.

- [ ] **Step 1: Payments link to ArcScan in `AgentFeed.tsx`** — give the payments list a `sellerAddress` prop and use `settlementUrl`:

```tsx
import { settlementUrl } from "@nanovpn/core";
// signature: export function AgentFeed({ runId, sellerAddress }: { runId: string; sellerAddress?: string }) {
// payments <li> gains:
              <a className="agent-pay__view" target="_blank" rel="noreferrer"
                 href={settlementUrl({ txHash: e.content.txHash, address: sellerAddress })}>view ↗</a>
```

(`agent-feed.test.tsx` renders `AgentFeed` with a `runId` only — `sellerAddress` optional keeps it green.)

- [ ] **Step 2: Create `AgentStatusRail.tsx`** — mini globe + gauge + result (payments stay in `AgentFeed`, or move here; keep it simple — globe + gauge + result):

```tsx
"use client";
import { GlobeMap } from "./GlobeMap";
import { formatUsd } from "./format";
import type { NodeListing } from "@nanovpn/core";

export function AgentStatusRail({ nodeId, spentMicroUsd, budgetMicroUsd, status, nodes }: {
  nodeId: string | null; spentMicroUsd: number; budgetMicroUsd: number; status: string; nodes: NodeListing[];
}) {
  const pct = budgetMicroUsd > 0 ? Math.min(100, Math.round((spentMicroUsd / budgetMicroUsd) * 100)) : 0;
  const chosen = nodes.find((n) => n.id === nodeId) ?? null;
  return (
    <aside className="agent-rail">
      <span className="eyebrow">Chosen node</span>
      <div className="agent-rail__globe">
        <GlobeMap nodes={nodes} selectedId={nodeId} connected={!!nodeId} streaming={null} onSelect={() => {}} />
      </div>
      <div className="agent-rail__node">{chosen ? `● ${chosen.geo.city}, ${chosen.geo.country}` : "choosing…"}</div>
      <span className="eyebrow">Budget</span>
      <div className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></div>
      <div className="agent-rail__spend">{formatUsd(spentMicroUsd)} / {formatUsd(budgetMicroUsd)}</div>
      <div className="agent-rail__status" data-status={status}>{status.replace("_", " ")}</div>
    </aside>
  );
}
```

- [ ] **Step 3: Restructure `agent/page.tsx`** to layout A (timeline left, status rail right). Fetch nodes server-side for the rail; pass `sellerAddress` to `AgentFeed`:

```tsx
import { supabaseService } from "@/lib/supabase-server";
import { AgentFeed } from "@/components/AgentFeed";
import { AgentRunForm } from "@/components/AgentRunForm";
import { AgentStatusRail } from "@/components/AgentStatusRail";
import type { NodeListing } from "@nanovpn/core";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const db = supabaseService();
  const cols = "id,goal,status,spent_micro_usd,budget_micro_usd,node_id";
  const { data: row } = run
    ? await db.from("agent_runs").select(cols).eq("id", run).maybeSingle()
    : await db.from("agent_runs").select(cols).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: nodeRows } = await db.from("nodes").select("id,city,country,lat,lng,operator_address,price_per_gb_usd,price_per_request_usd");
  const nodes: NodeListing[] = (nodeRows ?? []).map((n: any) => ({ id: n.id, operatorAddress: n.operator_address, geo: { city: n.city, country: n.country, lat: n.lat, lng: n.lng }, proxyUrl: "", settleUrl: "", pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd }));

  if (!row) {
    return <main className="agent-page"><h1>Watch the AI work</h1><AgentRunForm /><p className="muted">No runs yet. Give it a goal + budget above.</p></main>;
  }
  const seller = nodes.find((n) => n.id === row.node_id)?.operatorAddress;

  return (
    <main className="agent-page">
      <h1>Watch the AI work</h1>
      <AgentRunForm />
      <header className="agent-run"><p className="agent-run__goal">{row.goal}</p></header>
      <div className="agent-layout">
        <AgentFeed runId={row.id} sellerAddress={seller} />
        <AgentStatusRail nodeId={row.node_id} spentMicroUsd={row.spent_micro_usd} budgetMicroUsd={row.budget_micro_usd} status={row.status} nodes={nodes} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: CSS** — add `.agent-layout` (timeline + rail grid), `.agent-rail`, `.agent-rail__globe { height: 220px; position: relative; }` and timeline chip styles in `globals.css`. (Polish in the screenshot loop.)

- [ ] **Step 5: Run web tests + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: all web tests green (incl. existing `agent-feed.test.tsx`); build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/AgentStatusRail.tsx apps/web/components/AgentFeed.tsx apps/web/app/agent/page.tsx apps/web/app/globals.css
git commit -m "feat(web): agent showcase layout A — timeline + status rail (mini globe, gauge, ArcScan)"
```

---

## Task 14: Web — `/use-with-agent` onboarding page + `/developers` redirect

**Files:**
- Create: `apps/web/app/use-with-agent/page.tsx`, `apps/web/app/developers/route.ts`
- Delete: `apps/web/app/developers/page.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/onboarding.test.ts` (existing — repoint if it imports the old page)

**VISUAL TASK** — layout A (centered quickstart). Reuse `AGENT_PROMPT`, `EGRESS_ENDPOINT_FACTS`, `CopyButton`.

- [ ] **Step 1: Create `use-with-agent/page.tsx`** (layout A: headline → flow strip → copy-prompt → code → endpoint reference → links):

```tsx
import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "NanoVPN — use with your agent" };

export default function UseWithAgentPage() {
  return (
    <main className="onb">
      <h1>Give your AI agent <b>pay-per-use internet</b></h1>
      <p className="onb__lede">Geo-located egress, paid in USDC per request over x402 on Arc — no subscription, no account.</p>
      <div className="onb__flow"><span>POST /egress</span><i>→</i><span>402 challenge</span><i>→</i><span>sign + retry</span><i>→</i><span>200 + egress IP</span></div>

      <section className="onb__sec">
        <div className="onb__head"><span className="eyebrow">1 · Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
        <pre className="onb__code">{AGENT_PROMPT}</pre>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">2 · Or call it directly</span>
        <pre className="onb__code">await buyer.pay("https://&lt;node-host&gt;/egress?url=" + encodeURIComponent(url), {`{ method: "POST" }`})</pre>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">Endpoint reference</span>
        <ul className="onb__facts">
          <li><b>Endpoint</b><code>{EGRESS_ENDPOINT_FACTS.url}</code></li>
          <li><b>Network</b><code>{EGRESS_ENDPOINT_FACTS.network}</code></li>
          <li><b>Scheme</b><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></li>
          <li><b>Price</b><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></li>
        </ul>
        <p className="hint">Machine-readable: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Redirect `/developers`** — create `apps/web/app/developers/route.ts`:

```ts
import { redirect, permanentRedirect } from "next/navigation";
export const dynamic = "force-static";
export function GET() { permanentRedirect("/use-with-agent"); }
```

Then delete the old page: `git rm apps/web/app/developers/page.tsx`.

- [ ] **Step 3: Repoint the onboarding test** — if `apps/web/test/onboarding.test.ts` imports `app/developers/page`, change it to `app/use-with-agent/page`. Keep its assertions (renders the prompt + endpoint facts).

- [ ] **Step 4: CSS** — add `.onb`, `.onb__lede`, `.onb__flow`, `.onb__sec`, `.onb__code`, `.onb__facts` styles in `globals.css` (centered, max-width ~720px).

- [ ] **Step 5: Run web tests + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: green; build shows `/use-with-agent` + `/developers` routes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/use-with-agent/page.tsx apps/web/app/developers/route.ts apps/web/test/onboarding.test.ts apps/web/app/globals.css
git rm apps/web/app/developers/page.tsx
git commit -m "feat(web): /use-with-agent onboarding (layout A) + /developers redirect"
```

---

## Task 15: Full verification + live runs

**Files:** none (verification).

- [ ] **Step 1: Full suite + build**

Run: `pnpm -r test` then `pnpm -r build`
Expected: all green (75 existing + new: core +6, agent +3, web +5 ≈ 89), all workspaces build clean. Record counts.

- [ ] **Step 2: Apply migration 0003** (human) — paste `supabase/migrations/0003_more_nodes.sql` into the Supabase SQL editor; confirm 9 nodes total.

- [ ] **Step 3: Start servers + screenshot loop** — `set -a; source .env; set +a` → start edge-node :8080 → `pnpm --filter web dev`. Screenshot `/`, `/agent`, `/use-with-agent` with headless Chrome (`--use-gl=swiftshader --virtual-time-budget=6000`). Confirm: blue-marble globe reads clearly, 9 pins, header wallet, glass rail, agent timeline + status-rail globe, onboarding centered. Iterate visuals with **frontend-design**.

- [ ] **Step 4: Live human flow** — sign in via the header wallet → "✦ Let AI pick for me" selects a node + shows a reason → Connect → Start traffic (each intensity) → counter ticks, settlements post, a settlement "view ↗" opens an **ArcScan** page → Disconnect resets.

- [ ] **Step 5: Live from-web agent run** — `/agent`, goal + budget 0.02 (real Claude), Run → navigates to `/agent?run=<id>` → reasoning streams, the agent **names a node and pays it**, `agent_runs.node_id` = the agent's pick, payment "view ↗" → ArcScan, budget gauge < budget, SUCCEEDED.

- [ ] **Step 6: Stop servers by port; final commit.**

```bash
lsof -ti tcp:8080 | xargs -r kill
git add -A && git commit -m "test(ux v2): full suite green + live-verified globe, header wallet, co-pilot, genuine agent node-pick, ArcScan links"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §3 IA/header wallet → Tasks 9, 14 (nav relabel + redirect); §4.1 globe fix → Task 10; §4.2 rail → Task 11; §4.3 nodes → Task 3; §5 co-pilot → Task 12; §6.1 form → Task 8; §6.2 backend selection → Tasks 4-6; §6.3 agent view → Task 13; §6.4 bug guard → Task 5 (env already fixed); §5 onboarding (D5) → Task 14; §7 ArcScan → Tasks 1, 2, 11 (human), 13 (agent); §8 files → all; §10 testing → each task + Task 15. No spec requirement is unticked.

**Placeholder scan:** every code step has real code. The only deferred items are the visual CSS polish (Tasks 10/11/13/14, screenshot-iterated with frontend-design) and the live runs (Task 15) — inherent to visual/live verification, not placeholders. The Task 11 `copilotPick` stub is explicitly completed in Task 12 (noted in both).

**Type consistency:** `settlementUrl({txHash,address})` (Task 1) used identically in Tasks 11 + 13. `pickNodeDeterministic(loc, nodes)` (Task 12) returns `{nodeId, reason}` consumed in `page.tsx`. `payRequest({nodeId,url})→{…,nodeId}` (Task 4) consumed by `run.ts` + `events.setNode` (Task 5). `useWallet()`/`walletLabel` (Task 9) consumed by `WalletButton` + map page. `AgentStatusRail` props (Task 13) match its `agent/page.tsx` call site. `NodeListing` shape (`n.geo.{lat,lng,city,country}`, `n.pricePerGbUsd`, `n.operatorAddress`) used consistently.

**Known verify-at-execution items (don't block):** the conservative max-price guardrail pre-check (Task 5) requires budget ≥ the most expensive node's per-request price (true for demo budgets); `fetchSettlementTxHash` shape-scrape (Task 2) is best-effort — the address fallback guarantees an ArcScan link regardless; `--use-gl=swiftshader` is required for the headless globe screenshot; the `runner.test.ts`/`run.test.ts` mock-DB doubles (Task 5) may need a `proxy_url`/`setNode` shim to match the new code.
