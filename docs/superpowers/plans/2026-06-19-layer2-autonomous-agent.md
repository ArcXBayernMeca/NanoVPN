# Layer 2 — Autonomous Agent Egress Buyer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-repo Claude-driven CLI agent that, given a one-line goal + USDC budget, reasons about which node to use and pays x402 per request for geo-located egress — with reasoning, payments, and settlements streamed live to a web `/agent` panel.

**Architecture:** Adds `apps/agent` (Claude tool-use loop + deterministic budget guardrails + mock mode) and a new edge-node `POST /egress` endpoint (x402 per-request: verify→fetch→settle, charging only for delivered egress). Reuses the Layer-1 x402 buyer (`GatewayClient.pay`), the seller facilitator (`BatchFacilitatorClient`), Supabase realtime, the core package, and the web shell. New Supabase tables `agent_runs`/`agent_events` (realtime, public-read) feed a read-only `/agent` panel.

**Tech Stack:** TypeScript (Node ≥22, ESM), pnpm workspaces, vitest, `@circle-fin/x402-batching` (GatewayClient + BatchFacilitatorClient), `@anthropic-ai/sdk`, Supabase (`@supabase/supabase-js` server / `@supabase/ssr` browser), Next.js 16, Arc testnet.

Spec: [docs/superpowers/specs/2026-06-19-layer2-autonomous-agent-design.md](../specs/2026-06-19-layer2-autonomous-agent-design.md).

## Global Constraints

- **Testnet only.** Arc chain id `5042002`; network string `eip155:5042002`. Never target mainnet.
- **USDC = 6 decimals.** µUSD == atomic USDC (`microUsd` everywhere). Native gas is 18 dec — never mixed here.
- **Secrets** come from env vars only; never hardcode/commit/log private keys. Agent wallet key = `BUYER_PRIVATE_KEY` (reuse Layer-1 buyer for the demo). Edge-node never holds the seller key (`SELLER_ADDRESS` only).
- **x402 auth validity:** `buildRequirements` already sets `maxTimeoutSeconds: 2592000` (30 days). The live Arc facilitator rejects the SDK default 4 days. Do **not** change this. `/egress` reuses `buildRequirements`, so it inherits the correct value.
- **Anthropic model:** `claude-opus-4-8` exactly (no date suffix). Thinking: `thinking: { type: "adaptive" }` — `budget_tokens` is removed on Opus 4.8 and returns 400. Effort: `output_config: { effort: "medium" }` (tunable). `temperature`/`top_p`/`top_k` are removed on Opus 4.8 (400 if sent) — do not pass them.
- **Charging policy:** charge ONLY for delivered egress. The node verifies the payment (off-chain), fetches the target, and settles only if the fetch returns any HTTP response. A connection/egress failure → no settle → buyer not charged. An upstream HTTP error status (4xx/5xx) still counts as delivered egress → charged.
- **ESM:** all packages are `"type": "module"`. No `__dirname`; use relative paths or `import.meta.url`.
- **Existing tests stay green:** 27 tests across core(5)/edge-node(14)/web(8). Run `pnpm -r test` before declaring done.

---

## File Structure

**New files:**
- `packages/core/src/pricing.ts` — add `microUsdForRequest()` (modify existing file).
- `apps/edge-node/src/ssrf.ts` — `assertPublicUrl()` SSRF guard.
- `apps/edge-node/src/egress-endpoint.ts` — `handleEgress()` (x402 per-request seller).
- `apps/edge-node/src/index.ts` — wire `/egress` route + egress-IP + price (modify existing file).
- `supabase/migrations/0002_agent.sql` — `agent_runs` + `agent_events` + realtime + RLS; seed 2 more nodes.
- `apps/agent/package.json`, `apps/agent/tsconfig.json`, `apps/agent/vitest.config.ts` — scaffold.
- `apps/agent/src/guardrails.ts` — deterministic budget/request-cap guard.
- `apps/agent/src/tools.ts` — tool JSON definitions + executors (`listNodes`/`getBalance`/`payRequest`).
- `apps/agent/src/events.ts` — Supabase event writer (`agent_runs`/`agent_events`).
- `apps/agent/src/brain.ts` — `Brain` interface + `AnthropicBrain` + `MockBrain`.
- `apps/agent/src/run.ts` — the agentic loop (`runAgent`).
- `apps/agent/src/index.ts` — CLI entry (`--goal/--budget/--node/--mock`).
- `apps/web/components/AgentFeed.tsx` — realtime reasoning + payments feed.
- `apps/web/app/agent/page.tsx` — `/agent` panel.
- `apps/web/app/agent-onboarding/route.ts` + `apps/web/app/llms.txt/route.ts` — served docs.
- Tests under each package's `test/` dir.

**Modified files:** `packages/core/src/pricing.ts`, `apps/edge-node/src/index.ts`, `supabase/seed` (via migration), root docs.

Each unit has one responsibility and a typed interface; the run loop depends on `Brain`/executors/guardrails/events purely through their interfaces, so each is independently testable with fakes.

---

## Task 1: core — per-request pricing helper

**Files:**
- Modify: `packages/core/src/pricing.ts`
- Test: `packages/core/test/pricing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `microUsdForRequest(pricePerRequestUsd: number): number` — flat per-request price in integer µUSD (atomic USDC).

- [ ] **Step 1: Write the failing test** — append to `packages/core/test/pricing.test.ts`:

```ts
import { microUsdForRequest } from "../src/pricing";

describe("microUsdForRequest", () => {
  it("converts a flat USD per-request price to integer µUSD", () => {
    expect(microUsdForRequest(0.001)).toBe(1000); // $0.001 = 1000 atomic units
    expect(microUsdForRequest(0.01)).toBe(10000);
  });
  it("rounds to an integer (no fractional atomic units)", () => {
    expect(microUsdForRequest(0.0000015)).toBe(2); // 1.5 → 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/core test`
Expected: FAIL — `microUsdForRequest is not a function`.

- [ ] **Step 3: Write minimal implementation** — append to `packages/core/src/pricing.ts`:

```ts
/** Flat per-request price ($) → integer µUSD (atomic USDC, 6 dec). */
export function microUsdForRequest(pricePerRequestUsd: number): number {
  return Math.round(pricePerRequestUsd * 1_000_000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/core test`
Expected: PASS (existing pricing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pricing.ts packages/core/test/pricing.test.ts
git commit -m "feat(core): microUsdForRequest helper for x402 per-request pricing"
```

---

## Task 2: edge-node — SSRF guard for egress targets

The `/egress` endpoint fetches arbitrary agent-supplied URLs, so it needs an SSRF guard (Layer-1 `/api/browse` used a fixed allow-list; the agent path is open, so we validate the resolved IP).

**Files:**
- Create: `apps/edge-node/src/ssrf.ts`
- Test: `apps/edge-node/test/ssrf.test.ts`

**Interfaces:**
- Consumes: nothing (an injectable `lookup` for tests).
- Produces: `assertPublicUrl(raw: string, lookup?: LookupFn): Promise<URL>` — resolves and validates; throws `Error` for non-http(s), private/loopback/link-local/reserved IPs, or unresolvable hosts. `type LookupFn = (host: string) => Promise<string>` (returns an IP string).

- [ ] **Step 1: Write the failing test** — `apps/edge-node/test/ssrf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertPublicUrl } from "../src/ssrf";

const publicLookup = async () => "93.184.216.34"; // example.com

describe("assertPublicUrl", () => {
  it("accepts a public https URL", async () => {
    const u = await assertPublicUrl("https://example.com/x", publicLookup);
    expect(u.hostname).toBe("example.com");
  });
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicLookup)).rejects.toThrow();
  });
  it("rejects loopback", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "127.0.0.1")).rejects.toThrow();
  });
  it("rejects private ranges", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "10.1.2.3")).rejects.toThrow();
    await expect(assertPublicUrl("http://x.test", async () => "192.168.1.1")).rejects.toThrow();
    await expect(assertPublicUrl("http://x.test", async () => "172.16.5.4")).rejects.toThrow();
  });
  it("rejects link-local / cloud metadata", async () => {
    await expect(assertPublicUrl("http://x.test", async () => "169.254.169.254")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/edge-node test ssrf`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/edge-node/src/ssrf.ts`:

```ts
import { lookup as dnsLookup } from "node:dns/promises";

export type LookupFn = (host: string) => Promise<string>;

const defaultLookup: LookupFn = async (host) => (await dnsLookup(host)).address;

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // reject malformed
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;                 // loopback
  if (a === 0) return true;                    // "this network"
  if (a === 169 && b === 254) return true;     // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;                    // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    // loopback ::1, unspecified ::, unique-local fc00::/7, link-local fe80::/10
    return low === "::1" || low === "::" || low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb");
  }
  return isPrivateIpv4(ip);
}

export async function assertPublicUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("invalid url"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme not allowed");
  const ip = await lookup(url.hostname);
  if (isPrivateIp(ip)) throw new Error("target resolves to a private/reserved address");
  return url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/edge-node test ssrf`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/edge-node/src/ssrf.ts apps/edge-node/test/ssrf.test.ts
git commit -m "feat(edge-node): SSRF guard for agent-supplied egress targets"
```

---

## Task 3: edge-node — `handleEgress` (x402 per-request seller)

Mirrors `handleSettle` ([apps/edge-node/src/settle-endpoint.ts](../../../apps/edge-node/src/settle-endpoint.ts)) but for a discrete request, with verify→fetch→settle ordering so a failed connection is never charged. Reuses `buildRequirements`.

**Files:**
- Create: `apps/edge-node/src/egress-endpoint.ts`
- Test: `apps/edge-node/test/egress-endpoint.test.ts`

**Interfaces:**
- Consumes: `buildRequirements` (from `./settle-endpoint`), `assertPublicUrl` (from `./ssrf`), `microUsdForRequest` is NOT used here (the price is passed in as µUSD).
- Produces:
  ```ts
  interface EgressDeps {
    facilitator: { verify(p: unknown, r: Requirements): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
                   settle(p: unknown, r: Requirements): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction?: string }>; };
    sellerAddress: string;
    priceMicroUsd: number;
    egressIp: string;
    fetchTarget: (url: URL) => Promise<{ status: number; bytes: number }>;
    lookup?: import("./ssrf").LookupFn;
  }
  function handleEgress(req: IncomingMessage, res: ServerResponse, deps: EgressDeps): Promise<void>
  ```
  Behavior: target from `?url=`; no `payment-signature` header → 402 with `PAYMENT-REQUIRED` challenge (no fetch); with signature → verify → `fetchTarget` → settle → 200 `{ status, bytes, egressIp }` + `PAYMENT-RESPONSE`. Connection failure (`fetchTarget` throws) → 502, no settle. Verify failure → 402.

- [ ] **Step 1: Write the failing test** — `apps/edge-node/test/egress-endpoint.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handleEgress } from "../src/egress-endpoint";

const SELLER = "0x933a240000000000000000000000000000000000";
const publicLookup = async () => "93.184.216.34";

function fakeRes() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: "",
    writeHead(code: number, h?: Record<string, string>) { this.statusCode = code; if (h) Object.assign(this.headers, h); return this; },
    end(b?: string) { if (b) this.body = b; },
  };
}
const sig = Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64");
const okFacilitator = () => ({
  verify: vi.fn().mockResolvedValue({ isValid: true, payer: "0xpayer" }),
  settle: vi.fn().mockResolvedValue({ success: true, transaction: "uuid-1", payer: "0xpayer" }),
});

describe("handleEgress", () => {
  it("returns 402 challenge when no payment signature (no fetch)", async () => {
    const res = fakeRes();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: {} } as any, res as any,
      { facilitator: {} as any, sellerAddress: SELLER, priceMicroUsd: 1000, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(res.statusCode).toBe(402);
    const ch = JSON.parse(Buffer.from(res.headers["PAYMENT-REQUIRED"], "base64").toString("utf8"));
    expect(ch.accepts[0].amount).toBe("1000");
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it("happy path: verify → fetch → settle, returns body and charges", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 200, bytes: 4096 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(fetchTarget).toHaveBeenCalled();
    expect(facilitator.settle).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 200, bytes: 4096, egressIp: "203.0.113.7", transaction: "uuid-1" });
  });

  it("connection failure → 502, NO settle (refund policy)", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled(); // never charged
    expect(res.statusCode).toBe(502);
  });

  it("upstream HTTP error status still counts as delivered egress → charged", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 503, bytes: 120 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.settle).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe(503);
  });

  it("rejects a private target with 400 (SSRF) before any payment", async () => {
    const res = fakeRes();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=http%3A%2F%2Finternal", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: okFacilitator() as any, sellerAddress: SELLER, priceMicroUsd: 1000, egressIp: "203.0.113.7", fetchTarget, lookup: async () => "10.0.0.5" },
    );
    expect(res.statusCode).toBe(400);
    expect(fetchTarget).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/edge-node test egress-endpoint`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/edge-node/src/egress-endpoint.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildRequirements, type Requirements } from "./settle-endpoint";
import { assertPublicUrl, type LookupFn } from "./ssrf";

interface Facilitator {
  verify(payload: unknown, req: Requirements): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(payload: unknown, req: Requirements): Promise<{ success: boolean; errorReason?: string; payer?: string; transaction?: string }>;
}

export interface EgressDeps {
  facilitator: Facilitator;
  sellerAddress: string;
  priceMicroUsd: number;
  egressIp: string;
  fetchTarget: (url: URL) => Promise<{ status: number; bytes: number }>;
  lookup?: LookupFn;
}

export async function handleEgress(req: IncomingMessage, res: ServerResponse, deps: EgressDeps) {
  const target = new URL(req.url ?? "", "http://x").searchParams.get("url") ?? "";

  let url: URL;
  try { url = await assertPublicUrl(target, deps.lookup); }
  catch (e) { res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (e as Error).message })); return; }

  const requirements = buildRequirements(deps.priceMicroUsd, deps.sellerAddress);
  const sig = req.headers["payment-signature"] as string | undefined;

  if (!sig) {
    const challenge = {
      x402Version: 2,
      resource: { url: `/egress?url=${encodeURIComponent(target)}`, description: "NanoVPN per-request geo egress", mimeType: "application/json" },
      accepts: [requirements],
    };
    res.writeHead(402, { "Content-Type": "application/json", "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64") }).end("{}");
    return;
  }

  // 1. verify (off-chain — no money moves yet)
  const payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8"));
  const verified = await deps.facilitator.verify(payload, requirements);
  if (!verified.isValid) { res.writeHead(402, { "Content-Type": "application/json" }).end(JSON.stringify({ error: verified.invalidReason })); return; }

  // 2. deliver egress. A connection failure here = NOT charged (no settle).
  let result: { status: number; bytes: number };
  try { result = await deps.fetchTarget(url); }
  catch (e) { res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: `egress failed: ${(e as Error).message}` })); return; }

  // 3. settle (the on-chain charge) — only because egress was delivered.
  const settled = await deps.facilitator.settle(payload, requirements);
  if (!settled.success || !settled.transaction) {
    res.writeHead(402, { "Content-Type": "application/json" }).end(JSON.stringify({ error: settled.errorReason ?? "settle failed" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ success: true, transaction: settled.transaction, network: requirements.network, payer: settled.payer })).toString("base64"),
  }).end(JSON.stringify({ status: result.status, bytes: result.bytes, egressIp: deps.egressIp, transaction: settled.transaction }));
}
```

Note: `Requirements` must be exported from `settle-endpoint.ts`. It already is (`export interface Requirements`). `buildRequirements` is already exported.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/edge-node test egress-endpoint`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/edge-node/src/egress-endpoint.ts apps/edge-node/test/egress-endpoint.test.ts
git commit -m "feat(edge-node): POST /egress x402 per-request handler (verify→fetch→settle)"
```

---

## Task 4: edge-node — wire `/egress` route + egress IP + price into the server

**Files:**
- Modify: `apps/edge-node/src/index.ts`

**Interfaces:**
- Consumes: `handleEgress` (Task 3), `microUsdForRequest` (Task 1), the existing `facilitator` (`BatchFacilitatorClient`) and `SELLER_ADDRESS`.
- Produces: a live `POST /egress` route; a one-time resolved `EGRESS_IP`; `EGRESS_PRICE_MICRO_USD` from env.

- [ ] **Step 1: Add imports** — at the top of `apps/edge-node/src/index.ts`, after the existing imports:

```ts
import { handleEgress } from "./egress-endpoint";
import { microUsdForRequest } from "@nanovpn/core";
```

- [ ] **Step 2: Add config + egress-IP resolution** — after the `const SELF = ...` line:

```ts
const EGRESS_PRICE_MICRO_USD = microUsdForRequest(Number(process.env.EDGE_NODE_PRICE_PER_REQUEST_USD ?? 0.001));

// The node's own outbound IP = the geo proof returned to agents. Resolve once at
// startup (env override → public echo → "unknown"); never blocks request handling.
let EGRESS_IP = process.env.EDGE_NODE_EGRESS_IP ?? "unknown";
async function resolveEgressIp() {
  if (EGRESS_IP !== "unknown") return;
  try { EGRESS_IP = (await (await fetch("https://api.ipify.org?format=json")).json()).ip ?? "unknown"; }
  catch { /* leave "unknown" — non-fatal */ }
}

// Real per-request egress: fetch the target server-side (the node IS the egress) and count body bytes.
async function fetchTarget(url: URL): Promise<{ status: number; bytes: number }> {
  const r = await fetch(url, { redirect: "follow" });
  const buf = await r.arrayBuffer();
  return { status: r.status, bytes: buf.byteLength };
}
```

- [ ] **Step 3: Add the route** — inside the `http.createServer` handler, next to the `/settle` route line, add:

```ts
    if (url.pathname === "/egress" && req.method === "POST") {
      await handleEgress(req, res, { facilitator, sellerAddress: SELLER_ADDRESS, priceMicroUsd: EGRESS_PRICE_MICRO_USD, egressIp: EGRESS_IP, fetchTarget });
      return;
    }
```

- [ ] **Step 4: Resolve egress IP at boot** — change the final `server.listen(...)` line to:

```ts
server.listen(PORT, () => { console.log(`[edge-node] http+proxy on ${PORT}`); void resolveEgressIp(); });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nanovpn/edge-node build`
Expected: PASS (tsc --noEmit clean).

- [ ] **Step 6: Manual verify the route is live** (no payment → 402 challenge)

```bash
set -a; source .env; set +a
EDGE_NODE_PORT=8080 SELLER_ADDRESS="$SELLER_ADDRESS" pnpm --filter @nanovpn/edge-node start &
sleep 2
curl -s -i -X POST "http://localhost:8080/egress?url=https%3A%2F%2Fexample.com" | head -20
lsof -ti tcp:8080 | xargs -r kill
```

Expected: `HTTP/1.1 402` with a `PAYMENT-REQUIRED:` header. (Restart edge-node by PORT, never `pkill -f tsx` — it self-kills the shell.)

- [ ] **Step 7: Commit**

```bash
git add apps/edge-node/src/index.ts
git commit -m "feat(edge-node): wire POST /egress route + egress-IP resolution + per-request price"
```

---

## Task 5: supabase — `agent_runs`/`agent_events` migration + seed nodes

Mirrors the `settlements` realtime + public-read pattern in [supabase/migrations/0001_init.sql](../../../supabase/migrations/0001_init.sql). Agent payments live in `agent_events` (not `settlements` — that table's `session_id` FK is session-scoped). Seeds 2 more node rows (all pointing at the same proxy for the MVP) so node-selection reasoning is visible.

**Files:**
- Create: `supabase/migrations/0002_agent.sql`
- Test: `apps/web/test/agent-schema.test.ts` (string-asserts the SQL, mirroring `apps/web/test/supabase-schema.test.ts`).

**Interfaces:**
- Produces: tables `public.agent_runs`, `public.agent_events`; both public-read, both in `supabase_realtime`; two additional seeded `nodes` rows.

- [ ] **Step 1: Write the failing test** — `apps/web/test/agent-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0002_agent.sql", import.meta.url)), "utf8");

describe("0002_agent.sql", () => {
  it("creates agent_runs and agent_events", () => {
    expect(sql).toMatch(/create table public\.agent_runs/);
    expect(sql).toMatch(/create table public\.agent_events/);
  });
  it("enables RLS with public read on both", () => {
    expect(sql).toMatch(/alter table public\.agent_runs enable row level security/);
    expect(sql).toMatch(/alter table public\.agent_events enable row level security/);
    expect(sql).toMatch(/public read agent_runs/);
    expect(sql).toMatch(/public read agent_events/);
  });
  it("adds both tables to realtime", () => {
    expect(sql).toMatch(/add table public\.agent_runs/);
    expect(sql).toMatch(/add table public\.agent_events/);
  });
  it("seeds 2 extra nodes for visible selection", () => {
    expect(sql).toMatch(/frankfurt-1/);
    expect(sql).toMatch(/nyc-1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-schema`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0002_agent.sql`:

```sql
-- Layer 2: autonomous agent runs + per-step events (realtime, public-read).
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  goal text not null,
  budget_micro_usd bigint not null,
  spent_micro_usd bigint not null default 0,
  node_id text references public.nodes(id),
  status text not null default 'running' check (status in ('running','succeeded','failed','budget_exhausted')),
  result text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id),
  seq int not null,
  kind text not null check (kind in ('reasoning','tool_call','payment','result','error')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_events_run_seq on public.agent_events (run_id, seq);

alter table public.agent_runs enable row level security;
alter table public.agent_events enable row level security;
-- Public read: runs/events contain goal text, reasoning, amounts, tx hashes — no secrets.
create policy "public read agent_runs" on public.agent_runs for select using (true);
create policy "public read agent_events" on public.agent_events for select using (true);
-- Writes happen via the service-role key (bypasses RLS); no insert policies needed.

alter publication supabase_realtime add table public.agent_runs;
alter publication supabase_realtime add table public.agent_events;

-- Seed 2 more nodes (same proxy for the MVP) so the agent's node-selection reasoning is visible.
insert into public.nodes (id, operator_address, country, city, lat, lng, proxy_url, settle_url, price_per_gb_usd, price_per_request_usd)
values
  ('frankfurt-1', '0x0000000000000000000000000000000000000000', 'Germany', 'Frankfurt', 50.1109, 8.6821,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.5, 0.001),
  ('nyc-1', '0x0000000000000000000000000000000000000000', 'United States', 'New York', 40.7128, -74.0060,
   'http://localhost:8080', 'http://localhost:8080/settle', 2.0, 0.0008)
on conflict (id) do nothing;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test agent-schema`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply the migration to the live Supabase project**

Apply `supabase/migrations/0002_agent.sql` to project `qmgyechdxhpidwvbtosl` (via the Supabase SQL editor or `supabase db push`). Verify:

```bash
# Confirm tables exist (psql or Supabase SQL editor):
#   select count(*) from public.agent_runs;   -- 0, no error
#   select id from public.nodes order by id;   -- frankfurt-1, nyc-1, tokyo-1
```

Expected: both tables queryable; three node rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0002_agent.sql apps/web/test/agent-schema.test.ts
git commit -m "feat(supabase): agent_runs/agent_events (realtime, public-read) + seed 2 nodes"
```

---

## Task 6: agent — package scaffold

**Files:**
- Create: `apps/agent/package.json`, `apps/agent/tsconfig.json`, `apps/agent/vitest.config.ts`, `apps/agent/test/smoke.test.ts`

**Interfaces:**
- Produces: a runnable `@nanovpn/agent` workspace package with `test`/`build`/`start` scripts.

- [ ] **Step 1: Write `apps/agent/package.json`:**

```json
{
  "name": "@nanovpn/agent",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@nanovpn/core": "workspace:*",
    "@circle-fin/x402-batching": "^2.0.4",
    "@anthropic-ai/sdk": "^0.69.0",
    "@supabase/supabase-js": "^2.99.0",
    "viem": "^2.47.1"
  },
  "devDependencies": { "tsx": "^4.21.0", "typescript": "^5.9.3", "vitest": "^2.1.0", "@types/node": "^20.0.0" }
}
```

- [ ] **Step 2: Write `apps/agent/tsconfig.json`** (match the edge-node tsconfig shape):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Write `apps/agent/vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Write `apps/agent/test/smoke.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
describe("agent package", () => { it("runs vitest", () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 5: Install deps + run**

Run: `pnpm install && pnpm --filter @nanovpn/agent test`
Expected: deps resolve (`@anthropic-ai/sdk` installed); smoke test PASS.

Note: if `@anthropic-ai/sdk@^0.69.0` does not resolve, run `pnpm --filter @nanovpn/agent add @anthropic-ai/sdk@latest` and record the resolved version. Confirm `client.messages.create` accepts `output_config` + `thinking: {type:"adaptive"}` on the installed version (see `claude-api` skill — Opus 4.8 surface).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json apps/agent/tsconfig.json apps/agent/vitest.config.ts apps/agent/test/smoke.test.ts pnpm-lock.yaml
git commit -m "chore(agent): scaffold @nanovpn/agent workspace package"
```

---

## Task 7: agent — deterministic budget guardrails

**Files:**
- Create: `apps/agent/src/guardrails.ts`
- Test: `apps/agent/test/guardrails.test.ts`

**Interfaces:**
- Produces:
  ```ts
  class Guardrails {
    constructor(budgetMicroUsd: number, pricePerRequestMicroUsd: number, maxRequests?: number);
    canSpend(): boolean;        // true iff another payRequest stays within budget AND request cap
    record(amountMicroUsd: number): void;  // call after a successful pay
    get spentMicroUsd(): number;
    get requestCount(): number;
  }
  ```

- [ ] **Step 1: Write the failing test** — `apps/agent/test/guardrails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Guardrails } from "../src/guardrails";

describe("Guardrails", () => {
  it("allows spend within budget", () => {
    const g = new Guardrails(5000, 1000); // budget 5000µ, price 1000µ
    expect(g.canSpend()).toBe(true);
    g.record(1000);
    expect(g.spentMicroUsd).toBe(1000);
    expect(g.requestCount).toBe(1);
  });
  it("refuses the request that would exceed budget", () => {
    const g = new Guardrails(2500, 1000);
    g.record(1000); g.record(1000); // 2000 spent
    expect(g.canSpend()).toBe(false); // 2000 + 1000 = 3000 > 2500
  });
  it("enforces a max request cap independent of budget", () => {
    const g = new Guardrails(1_000_000, 1000, 2);
    g.record(1000); g.record(1000);
    expect(g.canSpend()).toBe(false); // hit 2-request cap
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test guardrails`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/agent/src/guardrails.ts`:

```ts
export class Guardrails {
  #spent = 0;
  #count = 0;
  constructor(
    private readonly budgetMicroUsd: number,
    private readonly pricePerRequestMicroUsd: number,
    private readonly maxRequests = 25,
  ) {}
  canSpend(): boolean {
    return this.#count < this.maxRequests && this.#spent + this.pricePerRequestMicroUsd <= this.budgetMicroUsd;
  }
  record(amountMicroUsd: number): void { this.#spent += amountMicroUsd; this.#count += 1; }
  get spentMicroUsd(): number { return this.#spent; }
  get requestCount(): number { return this.#count; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test guardrails`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/guardrails.ts apps/agent/test/guardrails.test.ts
git commit -m "feat(agent): deterministic budget + request-cap guardrails"
```

---

## Task 8: agent — tool definitions + executors

**Files:**
- Create: `apps/agent/src/tools.ts`
- Test: `apps/agent/test/tools.test.ts`

**Interfaces:**
- Consumes: a `GatewayClient`-like buyer (`{ pay<T>(url, opts): Promise<{ data: T; amount: bigint; transaction: string; status: number }>; getBalances(): Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }> }`) and a Supabase-like reader for nodes.
- Produces:
  ```ts
  const TOOL_DEFS: { name: string; description: string; input_schema: object }[]; // listNodes, getBalance, payRequest
  interface Executors {
    listNodes(): Promise<{ id: string; city: string; country: string; pricePerRequestUsd: number }[]>;
    getBalance(): Promise<{ wallet: string; gatewayAvailable: string }>;
    payRequest(input: { url: string }): Promise<{ status: number; bytes: number; egressIp: string; amountMicroUsd: number; transaction: string }>;
  }
  function makeExecutors(deps: {
    nodesReader: () => Promise<{ id: string; city: string; country: string; price_per_request_usd: number }[]>;
    buyer: { pay: <T>(url: string, opts?: { method?: string }) => Promise<{ data: T; amount: bigint; transaction: string; status: number }>;
             getBalances: () => Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }>; };
    egressBaseUrl: string;
  }): Executors;
  ```

- [ ] **Step 1: Write the failing test** — `apps/agent/test/tools.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { TOOL_DEFS, makeExecutors } from "../src/tools";

describe("TOOL_DEFS", () => {
  it("exposes listNodes, getBalance, payRequest", () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(["getBalance", "listNodes", "payRequest"]);
  });
  it("payRequest requires a url", () => {
    const t = TOOL_DEFS.find((t) => t.name === "payRequest")!;
    expect((t.input_schema as any).required).toContain("url");
  });
});

describe("executors", () => {
  it("payRequest pays the egress endpoint and maps the result", async () => {
    const buyer = {
      pay: vi.fn().mockResolvedValue({ data: { status: 200, bytes: 2048, egressIp: "203.0.113.7" }, amount: 1000n, transaction: "uuid-9", status: 200 }),
      getBalances: vi.fn(),
    };
    const ex = makeExecutors({ nodesReader: vi.fn(), buyer: buyer as any, egressBaseUrl: "http://localhost:8080/egress" });
    const r = await ex.payRequest({ url: "https://example.com" });
    expect(buyer.pay).toHaveBeenCalledWith("http://localhost:8080/egress?url=https%3A%2F%2Fexample.com", { method: "POST" });
    expect(r).toEqual({ status: 200, bytes: 2048, egressIp: "203.0.113.7", amountMicroUsd: 1000, transaction: "uuid-9" });
  });
  it("listNodes maps DB rows to a compact shape", async () => {
    const nodesReader = vi.fn().mockResolvedValue([{ id: "tokyo-1", city: "Tokyo", country: "Japan", price_per_request_usd: 0.001 }]);
    const ex = makeExecutors({ nodesReader, buyer: {} as any, egressBaseUrl: "x" });
    expect(await ex.listNodes()).toEqual([{ id: "tokyo-1", city: "Tokyo", country: "Japan", pricePerRequestUsd: 0.001 }]);
  });
  it("getBalance returns wallet + gateway available", async () => {
    const buyer = { pay: vi.fn(), getBalances: vi.fn().mockResolvedValue({ wallet: { formatted: "39.0" }, gateway: { formattedAvailable: "0.46" } }) };
    const ex = makeExecutors({ nodesReader: vi.fn(), buyer: buyer as any, egressBaseUrl: "x" });
    expect(await ex.getBalance()).toEqual({ wallet: "39.0", gatewayAvailable: "0.46" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test tools`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/agent/src/tools.ts`:

```ts
export const TOOL_DEFS = [
  {
    name: "listNodes",
    description: "List available egress nodes (id, city, country, per-request price in USD). Call this first to choose where to route egress.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getBalance",
    description: "Get the agent wallet's USDC balance (wallet + Gateway available). Use to check funds before paying.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "payRequest",
    description: "Pay USDC (x402) for ONE geo-located egress request through the selected node. Returns the upstream HTTP status, bytes transferred, and the node's egress IP (geo proof). Each call is one payment.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "The absolute https URL to fetch through the egress node." } },
      required: ["url"], additionalProperties: false,
    },
  },
] as const;

export interface Executors {
  listNodes(): Promise<{ id: string; city: string; country: string; pricePerRequestUsd: number }[]>;
  getBalance(): Promise<{ wallet: string; gatewayAvailable: string }>;
  payRequest(input: { url: string }): Promise<{ status: number; bytes: number; egressIp: string; amountMicroUsd: number; transaction: string }>;
}

interface Buyer {
  pay<T>(url: string, opts?: { method?: string }): Promise<{ data: T; amount: bigint; transaction: string; status: number }>;
  getBalances(): Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }>;
}

export function makeExecutors(deps: {
  nodesReader: () => Promise<{ id: string; city: string; country: string; price_per_request_usd: number }[]>;
  buyer: Buyer;
  egressBaseUrl: string;
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
    async payRequest({ url }) {
      const res = await deps.buyer.pay<{ status: number; bytes: number; egressIp: string }>(
        `${deps.egressBaseUrl}?url=${encodeURIComponent(url)}`, { method: "POST" },
      );
      return { status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp, amountMicroUsd: Number(res.amount), transaction: res.transaction };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test tools`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/tools.ts apps/agent/test/tools.test.ts
git commit -m "feat(agent): tool definitions + executors (listNodes/getBalance/payRequest)"
```

---

## Task 9: agent — Supabase event writer

**Files:**
- Create: `apps/agent/src/events.ts`
- Test: `apps/agent/test/events.test.ts`

**Interfaces:**
- Consumes: a Supabase-like client (`{ from(table).insert(row); from(table).update(row).eq(col, val); from(table).insert(row).select().single() }`).
- Produces:
  ```ts
  interface RunWriter {
    runId: string;
    reasoning(text: string): Promise<void>;       // kind=reasoning
    toolCall(name: string, input: unknown): Promise<void>;  // kind=tool_call
    payment(p: { amountMicroUsd: number; transaction: string; status: number; bytes: number; egressIp: string }): Promise<void>; // kind=payment, bumps run.spent
    error(message: string): Promise<void>;        // kind=error
    finish(status: "succeeded" | "failed" | "budget_exhausted", result: string): Promise<void>; // kind=result + run.status/ended_at
  }
  function startRun(db: DbLike, opts: { runId: string; goal: string; budgetMicroUsd: number; nodeId: string | null }): Promise<RunWriter>;
  ```
  `seq` increments per event within a run. `payment` increments `agent_runs.spent_micro_usd` by `amountMicroUsd`.

- [ ] **Step 1: Write the failing test** — `apps/agent/test/events.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { startRun } from "../src/events";

function fakeDb() {
  const inserts: { table: string; row: any }[] = [];
  const updates: { table: string; row: any; eq: [string, any] }[] = [];
  return {
    inserts, updates,
    from(table: string) {
      return {
        insert(row: any) { inserts.push({ table, row }); return this; },
        update(row: any) { return { eq: (c: string, v: any) => { updates.push({ table, row, eq: [c, v] }); return Promise.resolve({}); } }; },
        select() { return this; },
        single() { return Promise.resolve({}); },
      };
    },
  };
}

describe("event writer", () => {
  it("creates the run row then writes ordered events", async () => {
    const db = fakeDb();
    const run = await startRun(db as any, { runId: "r1", goal: "check JP price", budgetMicroUsd: 500000, nodeId: "tokyo-1" });
    await run.reasoning("I'll use tokyo-1");
    await run.toolCall("payRequest", { url: "https://x" });
    await run.payment({ amountMicroUsd: 1000, transaction: "tx1", status: 200, bytes: 2048, egressIp: "203.0.113.7" });
    await run.finish("succeeded", "done");

    const runRow = db.inserts.find((i) => i.table === "agent_runs")!.row;
    expect(runRow).toMatchObject({ id: "r1", goal: "check JP price", budget_micro_usd: 500000, node_id: "tokyo-1", status: "running" });

    const events = db.inserts.filter((i) => i.table === "agent_events").map((i) => i.row);
    expect(events.map((e) => e.kind)).toEqual(["reasoning", "tool_call", "payment", "result"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]); // monotonic
    expect(events[2].content).toMatchObject({ amountMicroUsd: 1000, transaction: "tx1" });

    // run.spent bumped on payment; status/ended_at set on finish
    const spentUpdate = db.updates.find((u) => u.table === "agent_runs" && "spent_micro_usd" in u.row);
    expect(spentUpdate?.row.spent_micro_usd).toBe(1000);
    const finishUpdate = db.updates.find((u) => u.table === "agent_runs" && u.row.status === "succeeded");
    expect(finishUpdate).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test events`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/agent/src/events.ts`:

```ts
type DbLike = {
  from(table: string): {
    insert(row: unknown): unknown;
    update(row: unknown): { eq(col: string, val: unknown): Promise<unknown> };
  };
};

export interface RunWriter {
  runId: string;
  reasoning(text: string): Promise<void>;
  toolCall(name: string, input: unknown): Promise<void>;
  payment(p: { amountMicroUsd: number; transaction: string; status: number; bytes: number; egressIp: string }): Promise<void>;
  error(message: string): Promise<void>;
  finish(status: "succeeded" | "failed" | "budget_exhausted", result: string): Promise<void>;
}

export async function startRun(
  db: DbLike,
  opts: { runId: string; goal: string; budgetMicroUsd: number; nodeId: string | null },
): Promise<RunWriter> {
  await db.from("agent_runs").insert({
    id: opts.runId, goal: opts.goal, budget_micro_usd: opts.budgetMicroUsd, node_id: opts.nodeId, status: "running",
  });
  let seq = 0;
  let spent = 0;

  const event = async (kind: string, content: unknown) => {
    seq += 1;
    await db.from("agent_events").insert({ run_id: opts.runId, seq, kind, content });
  };

  return {
    runId: opts.runId,
    reasoning: (text) => event("reasoning", { text }),
    toolCall: (name, input) => event("tool_call", { name, input }),
    async payment(p) {
      await event("payment", p);
      spent += p.amountMicroUsd;
      await db.from("agent_runs").update({ spent_micro_usd: spent }).eq("id", opts.runId);
    },
    error: (message) => event("error", { message }),
    async finish(status, result) {
      await event("result", { result });
      await db.from("agent_runs").update({ status, result, ended_at: new Date().toISOString() }).eq("id", opts.runId);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test events`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/events.ts apps/agent/test/events.test.ts
git commit -m "feat(agent): Supabase event writer for agent_runs/agent_events"
```

---

## Task 10: agent — Brain interface + MockBrain + AnthropicBrain

**Files:**
- Create: `apps/agent/src/brain.ts`
- Test: `apps/agent/test/brain.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Block =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
  type Msg = { role: "user" | "assistant"; content: string | Block[] };
  interface BrainTurn { content: Block[]; stopReason: string | null }
  interface Brain { next(messages: Msg[]): Promise<BrainTurn> }
  class MockBrain implements Brain { constructor(turns: BrainTurn[]); next(): Promise<BrainTurn> }  // returns queued turns in order
  function makeAnthropicBrain(opts: { apiKey: string; system: string; tools: readonly unknown[]; effort?: string }): Brain;
  ```

- [ ] **Step 1: Write the failing test** — `apps/agent/test/brain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MockBrain } from "../src/brain";

describe("MockBrain", () => {
  it("returns queued turns in order then throws when exhausted", async () => {
    const brain = new MockBrain([
      { content: [{ type: "tool_use", id: "t1", name: "listNodes", input: {} }], stopReason: "tool_use" },
      { content: [{ type: "text", text: "done" }], stopReason: "end_turn" },
    ]);
    expect((await brain.next([])).stopReason).toBe("tool_use");
    expect((await brain.next([])).stopReason).toBe("end_turn");
    await expect(brain.next([])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test brain`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/agent/src/brain.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export interface BrainTurn { content: Block[]; stopReason: string | null }
export interface Brain { next(messages: Msg[]): Promise<BrainTurn> }

export class MockBrain implements Brain {
  #turns: BrainTurn[];
  constructor(turns: BrainTurn[]) { this.#turns = [...turns]; }
  async next(): Promise<BrainTurn> {
    const t = this.#turns.shift();
    if (!t) throw new Error("MockBrain exhausted");
    return t;
  }
}

export function makeAnthropicBrain(opts: { apiKey: string; system: string; tools: readonly unknown[]; effort?: string }): Brain {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async next(messages: Msg[]): Promise<BrainTurn> {
      const res = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "medium" },
        system: opts.system,
        tools: opts.tools as Anthropic.Tool[],
        messages: messages as Anthropic.MessageParam[],
      });
      // Keep only text + tool_use blocks (drop thinking) for our loop's purposes.
      const content = res.content
        .filter((b) => b.type === "text" || b.type === "tool_use")
        .map((b) => b.type === "text"
          ? { type: "text" as const, text: b.text }
          : { type: "tool_use" as const, id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      return { content, stopReason: res.stop_reason };
    },
  };
}
```

Note: when echoing the assistant turn back to the API for the next iteration, the loop (Task 11) passes only the `text`/`tool_use` blocks we kept — adaptive thinking blocks are not required in the replay for this short loop. If the installed SDK rejects `output_config`/`thinking` shape, re-check the `claude-api` skill's Opus 4.8 section and adjust.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test brain`
Expected: PASS (MockBrain test). AnthropicBrain is exercised live in Task 15.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nanovpn/agent build`
Expected: PASS (confirms the Anthropic SDK call typechecks on the installed version).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/brain.ts apps/agent/test/brain.test.ts
git commit -m "feat(agent): Brain interface + MockBrain + AnthropicBrain (Opus 4.8, adaptive)"
```

---

## Task 11: agent — the run loop

The shared agentic loop. Drives any `Brain`, enforces guardrails before each `payRequest`, writes every step via the event writer, and terminates on `end_turn`, budget exhaustion, or request cap.

**Files:**
- Create: `apps/agent/src/run.ts`
- Test: `apps/agent/test/run.test.ts`

**Interfaces:**
- Consumes: `Brain`, `Executors`, `Guardrails`, `RunWriter`, `TOOL_DEFS`-shaped tool list.
- Produces:
  ```ts
  function runAgent(deps: {
    brain: Brain; executors: Executors; guardrails: Guardrails; events: RunWriter; goal: string;
  }): Promise<{ status: "succeeded" | "budget_exhausted" | "failed"; result: string }>;
  export function systemPrompt(goal: string, budgetUsd: number): string;
  ```

- [ ] **Step 1: Write the failing test** — `apps/agent/test/run.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runAgent } from "../src/run";
import { MockBrain } from "../src/brain";
import { Guardrails } from "../src/guardrails";

function recordingEvents() {
  const calls: string[] = [];
  return {
    calls,
    runId: "r1",
    reasoning: async (t: string) => { calls.push(`reasoning:${t}`); },
    toolCall: async (n: string) => { calls.push(`tool:${n}`); },
    payment: async (p: any) => { calls.push(`pay:${p.amountMicroUsd}`); },
    error: async (m: string) => { calls.push(`error:${m}`); },
    finish: async (s: string) => { calls.push(`finish:${s}`); },
  };
}

describe("runAgent", () => {
  it("runs reasoning → payRequest → end_turn and records events", async () => {
    const brain = new MockBrain([
      { content: [{ type: "text", text: "using tokyo-1" }, { type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://x" } }], stopReason: "tool_use" },
      { content: [{ type: "text", text: "got it" }], stopReason: "end_turn" },
    ]);
    const executors = {
      listNodes: vi.fn(), getBalance: vi.fn(),
      payRequest: vi.fn().mockResolvedValue({ status: 200, bytes: 2048, egressIp: "203.0.113.7", amountMicroUsd: 1000, transaction: "tx1" }),
    };
    const guardrails = new Guardrails(500000, 1000);
    const events = recordingEvents();
    const out = await runAgent({ brain, executors: executors as any, guardrails, events: events as any, goal: "g" });
    expect(out.status).toBe("succeeded");
    expect(events.calls).toContain("reasoning:using tokyo-1");
    expect(events.calls).toContain("tool:payRequest");
    expect(events.calls).toContain("pay:1000");
    expect(events.calls).toContain("finish:succeeded");
    expect(guardrails.spentMicroUsd).toBe(1000);
  });

  it("stops with budget_exhausted when a payRequest would exceed budget", async () => {
    const brain = new MockBrain([
      { content: [{ type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://x" } }], stopReason: "tool_use" },
    ]);
    const executors = { listNodes: vi.fn(), getBalance: vi.fn(), payRequest: vi.fn() };
    const guardrails = new Guardrails(500, 1000); // price 1000 > budget 500 → cannot spend
    const events = recordingEvents();
    const out = await runAgent({ brain, executors: executors as any, guardrails, events: events as any, goal: "g" });
    expect(out.status).toBe("budget_exhausted");
    expect(executors.payRequest).not.toHaveBeenCalled(); // never paid
    expect(events.calls).toContain("finish:budget_exhausted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test run`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/agent/src/run.ts`:

```ts
import type { Brain, Block, Msg } from "./brain";
import type { Executors } from "./tools";
import type { Guardrails } from "./guardrails";
import type { RunWriter } from "./events";

export function systemPrompt(goal: string, budgetUsd: number): string {
  return [
    "You are an autonomous egress-buyer agent for NanoVPN, a pay-per-use VPN.",
    "You complete the user's goal by paying USDC (x402) per request for geo-located egress through a node you select.",
    `Your goal: ${goal}`,
    `Your hard budget: $${budgetUsd} USDC. A deterministic guardrail also enforces this — if you try to over-spend, payRequest is refused and the run ends.`,
    "Workflow: call listNodes to see options and choose one (briefly explain why), optionally getBalance, then payRequest(url) for each fetch you need.",
    "Each payRequest is one payment and returns the upstream status, bytes, and the node's egress IP (your geo proof).",
    "When the goal is met or you are out of budget, stop and give a one-paragraph result.",
  ].join("\n");
}

const MAX_ITERATIONS = 30;

export async function runAgent(deps: {
  brain: Brain; executors: Executors; guardrails: Guardrails; events: RunWriter; goal: string;
}): Promise<{ status: "succeeded" | "budget_exhausted" | "failed"; result: string }> {
  const messages: Msg[] = [{ role: "user", content: `Goal: ${deps.goal}` }];
  let lastText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const turn = await deps.brain.next(messages);
    messages.push({ role: "assistant", content: turn.content });

    for (const b of turn.content) {
      if (b.type === "text" && b.text.trim()) { lastText = b.text; await deps.events.reasoning(b.text); }
    }

    if (turn.stopReason === "end_turn") {
      await deps.events.finish("succeeded", lastText);
      return { status: "succeeded", result: lastText };
    }

    const toolUses = turn.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length === 0) {
      await deps.events.finish("succeeded", lastText);
      return { status: "succeeded", result: lastText };
    }

    const results: Block[] = [];
    for (const tu of toolUses) {
      await deps.events.toolCall(tu.name, tu.input);
      try {
        if (tu.name === "payRequest") {
          if (!deps.guardrails.canSpend()) {
            const msg = "budget guardrail: payment refused (would exceed budget or request cap)";
            await deps.events.error(msg);
            await deps.events.finish("budget_exhausted", msg);
            return { status: "budget_exhausted", result: msg };
          }
          const r = await deps.executors.payRequest(tu.input as { url: string });
          deps.guardrails.record(r.amountMicroUsd);
          await deps.events.payment(r);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(r) });
        } else if (tu.name === "listNodes") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await deps.executors.listNodes()) });
        } else if (tu.name === "getBalance") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await deps.executors.getBalance()) });
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `unknown tool: ${tu.name}`, is_error: true });
        }
      } catch (e) {
        const msg = (e as Error).message;
        await deps.events.error(msg);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const msg = "max iterations reached";
  await deps.events.finish("failed", msg);
  return { status: "failed", result: msg };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/run.ts apps/agent/test/run.test.ts
git commit -m "feat(agent): agentic run loop (guardrails + events + tool dispatch)"
```

---

## Task 12: agent — CLI entrypoint (wires real implementations + mock mode)

**Files:**
- Create: `apps/agent/src/index.ts`

**Interfaces:**
- Consumes: everything above + `GatewayClient` (buyer), Supabase service client, `randomUUID`.
- Produces: `pnpm agent --goal "<text>" --budget <usd> [--node <id>] [--mock]`. Mock mode (or no `ANTHROPIC_API_KEY`) uses a scripted `MockBrain`.

- [ ] **Step 1: Write the CLI** — `apps/agent/src/index.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { microUsdForRequest } from "@nanovpn/core";
import { Guardrails } from "./guardrails";
import { makeExecutors } from "./tools";
import { startRun } from "./events";
import { TOOL_DEFS } from "./tools";
import { runAgent, systemPrompt } from "./run";
import { MockBrain, makeAnthropicBrain, type Brain } from "./brain";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const goal = arg("goal");
  const budgetUsd = Number(arg("budget", "0.5"));
  const nodeId = arg("node", "tokyo-1");
  const mock = hasFlag("mock") || !process.env.ANTHROPIC_API_KEY;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // Resolve the chosen node (egress endpoint + price). All MVP nodes share one proxy.
  const { data: node } = await db.from("nodes").select("*").eq("id", nodeId).single();
  if (!node) throw new Error(`unknown node ${nodeId}`);
  const egressBaseUrl = `${node.proxy_url}/egress`;
  const priceMicroUsd = microUsdForRequest(node.price_per_request_usd);
  const budgetMicroUsd = microUsdForRequest(budgetUsd);

  const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
  const executors = makeExecutors({
    nodesReader: async () => (await db.from("nodes").select("id,city,country,price_per_request_usd")).data ?? [],
    buyer: buyer as any,
    egressBaseUrl,
  });
  const guardrails = new Guardrails(budgetMicroUsd, priceMicroUsd);

  const runId = randomUUID();
  const events = await startRun(db as any, { runId, goal, budgetMicroUsd, nodeId });

  const brain: Brain = mock
    ? new MockBrain([
        { content: [{ type: "text", text: `(mock) I'll route through ${nodeId} and fetch the target once.` }, { type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://speed.cloudflare.com/__down?bytes=1000000" } }], stopReason: "tool_use" },
        { content: [{ type: "text", text: "(mock) Egress complete; goal satisfied." }], stopReason: "end_turn" },
      ])
    : makeAnthropicBrain({ apiKey: process.env.ANTHROPIC_API_KEY!, system: systemPrompt(goal, budgetUsd), tools: TOOL_DEFS, effort: process.env.AGENT_EFFORT ?? "medium" });

  console.log(`[agent] run ${runId} — goal=${JSON.stringify(goal)} budget=$${budgetUsd} node=${nodeId} mock=${mock}`);
  const out = await runAgent({ brain, executors, guardrails, events, goal });
  console.log(`[agent] ${out.status}: ${out.result}`);
  process.exit(out.status === "succeeded" ? 0 : 1);
}

main().catch((e) => { console.error("[agent] fatal:", e); process.exit(1); });
```

- [ ] **Step 2: Add a root convenience script** — in root `package.json` `scripts`, add:

```json
    "agent": "pnpm --filter @nanovpn/agent start --"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @nanovpn/agent build`
Expected: PASS.

- [ ] **Step 4: Manual verify — full mock run end-to-end against a local edge-node**

```bash
set -a; source .env; set +a
EDGE_NODE_PORT=8080 SELLER_ADDRESS="$SELLER_ADDRESS" pnpm --filter @nanovpn/edge-node start &
sleep 2
pnpm agent --goal "fetch a 1MB file via Tokyo" --budget 0.05 --node tokyo-1 --mock
lsof -ti tcp:8080 | xargs -r kill
```

Expected: agent exits 0; a real x402 payment settles for the mock's single `payRequest` (this exercises the live `/egress` → facilitator path even in mock mode, since only the *brain* is mocked). Confirm in Supabase: one `agent_runs` row (`status=succeeded`, `spent_micro_usd>0`) and `agent_events` rows (`reasoning`, `tool_call`, `payment`, `result`). If you want a purely offline check (no settlement), point `--node` at a node whose `proxy_url` is unreachable and confirm the run ends with an `error` event and non-zero exit.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/index.ts package.json
git commit -m "feat(agent): CLI entrypoint wiring GatewayClient + Supabase + mock mode"
```

---

## Task 13: web — `/agent` observation panel (Supabase realtime)

Read-only live view. Mirrors the realtime subscription pattern in [apps/web/components/SettlementLog.tsx](../../../apps/web/components/SettlementLog.tsx). Set up a Playwright screenshot loop before iterating on the visuals (per the Layer-1 retro — design with eyes, not blind).

**Files:**
- Create: `apps/web/components/AgentFeed.tsx`
- Create: `apps/web/app/agent/page.tsx`
- Test: `apps/web/test/agent-feed.test.tsx`

**Interfaces:**
- Consumes: `supabaseBrowser()` (from `@/lib/supabase`), `formatUsd` (from `@/components/format`).
- Produces: `<AgentFeed runId={string} />` — subscribes to `agent_events` for a run and renders a reasoning column + a payments tape; `/agent` page that loads the latest run (or `?run=<id>`) and mounts the feed.

- [ ] **Step 1: Write the failing test** — `apps/web/test/agent-feed.test.tsx` (light render test; mirrors `apps/web/test/world-map.test.tsx`). Mock the supabase client so no network:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }),
  }),
}));

import { AgentFeed } from "@/components/AgentFeed";

describe("AgentFeed", () => {
  it("renders empty state for a run with no events yet", () => {
    render(<AgentFeed runId="r1" />);
    expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-feed`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/components/AgentFeed.tsx`:**

```tsx
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatUsd } from "./format";

interface Event { id: string; seq: number; kind: string; content: any; }

export function AgentFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb.channel(`agent-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p) => setEvents((prev) => prev.some((e) => e.id === (p.new as Event).id) ? prev : [...prev, p.new as Event].sort((a, b) => a.seq - b.seq)))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await sb.from("agent_events").select("*").eq("run_id", runId).order("seq", { ascending: true });
          setEvents((data as Event[]) ?? []);
        }
      });
    return () => { sb.removeChannel(channel); };
  }, [runId]);

  const reasoning = events.filter((e) => e.kind === "reasoning" || e.kind === "tool_call" || e.kind === "result" || e.kind === "error");
  const payments = events.filter((e) => e.kind === "payment");

  return (
    <div className="agent-grid">
      <section className="agent-reasoning">
        <h2>Reasoning</h2>
        {reasoning.length === 0 ? <p className="muted">Waiting for the agent to think…</p> : (
          <ul>{reasoning.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <span className="agent-kind">{e.kind}</span>
              <span>{e.kind === "reasoning" ? e.content.text : e.kind === "tool_call" ? `${e.content.name}(${JSON.stringify(e.content.input)})` : e.kind === "result" ? e.content.result : e.content.message}</span>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="agent-payments">
        <h2>Payments</h2>
        {payments.length === 0 ? <p className="muted">No payments yet.</p> : (
          <ul>{payments.map((e) => (
            <li key={e.id}>
              <span className="agent-amt">{formatUsd(e.content.amountMicroUsd)}</span>
              <span>{e.content.status} · {e.content.bytes}B · {e.content.egressIp}</span>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `apps/web/app/agent/page.tsx`** (server component resolves the run id, client `AgentFeed` streams it):

```tsx
import { supabaseService } from "@/lib/supabase-server";
import { AgentFeed } from "@/components/AgentFeed";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  let runId = run ?? null;
  if (!runId) {
    const db = supabaseService();
    const { data } = await db.from("agent_runs").select("id").order("created_at", { ascending: false }).limit(1).single();
    runId = data?.id ?? null;
  }
  return (
    <main className="agent-page">
      <h1>Autonomous agent</h1>
      {runId ? <AgentFeed runId={runId} /> : <p className="muted">No agent runs yet. Start one: <code>pnpm agent --goal &quot;…&quot; --budget 0.5</code></p>}
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test agent-feed`
Expected: PASS.

- [ ] **Step 6: Set up a Playwright screenshot loop, then iterate the visuals**

Add a minimal screenshot script (or reuse one if present) that navigates to `http://localhost:3000/agent` and saves a PNG. Start web (`pnpm --filter web dev`), run a mock agent to populate a run, screenshot, and refine `globals.css` (`.agent-grid`, `.agent-reasoning`, `.agent-payments`, `.agent-kind`, `.agent-amt`) against the Layer-1 design system until it reads as a clean instrument panel. Do NOT iterate blind.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter web build` (or at least `tsc`/`next build` lint). Expected: PASS.

```bash
git add apps/web/components/AgentFeed.tsx apps/web/app/agent/page.tsx apps/web/test/agent-feed.test.tsx apps/web/app/globals.css
git commit -m "feat(web): /agent realtime observation panel (reasoning + payments)"
```

---

## Task 14: web — served agent-onboarding doc + llms.txt

Light reference docs (decision: live self-funding off the demo path). Served as text routes by the web app.

**Files:**
- Create: `apps/web/app/agent-onboarding/route.ts`
- Create: `apps/web/app/llms.txt/route.ts`
- Test: `apps/web/test/onboarding.test.ts`

**Interfaces:**
- Produces: `GET /agent-onboarding` → markdown; `GET /llms.txt` → text pointing at it and the `/egress` x402 endpoint.

- [ ] **Step 1: Write the failing test** — `apps/web/test/onboarding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET as onboarding } from "@/app/agent-onboarding/route";
import { GET as llms } from "@/app/llms.txt/route";

describe("served agent docs", () => {
  it("agent-onboarding documents the x402 egress endpoint and faucet (reference)", async () => {
    const text = await (await onboarding()).text();
    expect(text).toMatch(/POST \/egress/);
    expect(text).toMatch(/x402/i);
    expect(text).toMatch(/faucet/i);
  });
  it("llms.txt points at the onboarding doc", async () => {
    const text = await (await llms()).text();
    expect(text).toMatch(/agent-onboarding/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test onboarding`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/app/agent-onboarding/route.ts`:**

```ts
const DOC = `# NanoVPN — Agent Onboarding

NanoVPN sells geo-located egress per request, paid in USDC on Arc testnet (chain 5042002) via x402.

## 1. Get a wallet
Use a Circle Agent Wallet (or any EOA). For the demo, a pre-funded wallet is used.

## 2. Fund it (reference — not required for the hosted demo)
Arc testnet USDC via Circle's programmatic faucet:
  circle wallet fund --chain ARC-TESTNET
or POST /v1/faucet/drips. (The hosted demo runs on a pre-funded wallet; live self-funding is documented, not load-bearing.)

## 3. Pay per request (x402)
  POST /egress?url=<absolute-https-url>
- No payment header → 402 with a PAYMENT-REQUIRED challenge (Circle Gateway batched scheme).
- Sign the authorization and retry with the Payment-Signature header.
- The node verifies, fetches the URL through its egress IP, settles the payment, and returns:
    { "status": <upstream http status>, "bytes": <n>, "egressIp": "<node outbound ip>" }
- A failed connection is NOT charged (settlement is withheld until egress is delivered).

The @circle-fin/x402-batching GatewayClient.pay(url, { method: "POST" }) handles the full flow.
`;

export async function GET() {
  return new Response(DOC, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
```

- [ ] **Step 4: Write `apps/web/app/llms.txt/route.ts`:**

```ts
const TXT = `# NanoVPN
Pay-per-use geo egress, settled in USDC on Arc testnet via x402.

Agent onboarding: /agent-onboarding
Per-request egress endpoint: POST /egress?url=<absolute-https-url> (x402, Circle Gateway batched scheme)
Live agent activity: /agent
`;

export async function GET() {
  return new Response(TXT, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test onboarding`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/agent-onboarding/route.ts apps/web/app/llms.txt/route.ts apps/web/test/onboarding.test.ts
git commit -m "feat(web): served agent-onboarding doc + llms.txt"
```

---

## Task 15: live-verify one real agent run + full-suite green

Mirrors the Layer-1 discipline: exactly one real, non-mock end-to-end run proving the per-request x402 path settles on Arc, plus the whole suite green.

**Files:** none (verification task).

- [ ] **Step 1: Full test suite**

Run: `pnpm -r test`
Expected: all green — core (7), edge-node (19), web (11+), agent (new). Record the counts.

- [ ] **Step 2: Typecheck all workspaces**

Run: `pnpm -r build`
Expected: tsc/next clean across core, edge-node, web, agent.

- [ ] **Step 3: One real (non-mock) agent run**

```bash
set -a; source .env; set +a   # provides BUYER_PRIVATE_KEY, SUPABASE_*, ANTHROPIC_API_KEY
EDGE_NODE_PORT=8080 SELLER_ADDRESS="$SELLER_ADDRESS" pnpm --filter @nanovpn/edge-node start &
sleep 2
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" pnpm agent --goal "Fetch a small file via the Tokyo node and report its size" --budget 0.05 --node tokyo-1
lsof -ti tcp:8080 | xargs -r kill
```

Expected: the real Claude buyer-brain calls `listNodes`, picks a node (visible reasoning), calls `payRequest` ≥1 time, and exits 0. Confirm:
- `agent_runs` row: `status=succeeded`, `spent_micro_usd > 0`, `node_id` set.
- `agent_events`: `reasoning` + `tool_call` + ≥1 `payment` + `result`.
- The payment(s) settled for real (facilitator `transaction` present on each payment event).
- Budget enforced: total `spent_micro_usd ≤ budget_micro_usd`.

- [ ] **Step 4: Verify the panel renders it live**

Start web (`pnpm --filter web dev`), open `http://localhost:3000/agent`, and confirm the latest run's reasoning + payments render via realtime. Screenshot for the record.

- [ ] **Step 5: Verify the refund policy once (connection failure → no charge)**

Temporarily run the agent against a node whose `proxy_url` is unreachable (or stop the edge-node mid-run) and confirm an `error` event is recorded and no `payment`/`settlement` occurs for the failed attempt — i.e. the buyer is not charged when egress fails.

- [ ] **Step 6: Commit any doc/fixup**

```bash
git add -A
git commit -m "test(layer2): full-suite green + live-verified one real agent egress run"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §6.1 apps/agent → Tasks 6–12; §6.2 POST /egress → Tasks 2–4; §6.3 agent_runs/agent_events → Task 5; §6.4 /agent panel → Task 13; §6.5 onboarding doc/llms.txt → Task 14; §3 pricing helper → Task 1; §7 data flow → Tasks 11–12; §8 error handling (refund policy, mock, settle failure, soft-fail) → Tasks 3, 9, 11, 12, 15; §9 testing strategy → every task + Task 15; §12 decisions (charge-only-on-delivery, full reasoning text, 2–3 nodes) → Tasks 3, 9, 5. The §10 verify-at-planning flags are surfaced inline (Task 6 SDK resolution, Task 10 model/params via claude-api, Task 3/4 verify→settle split exercised live in Task 15).

**Placeholder scan:** every code step contains complete code; no TBD/TODO/"similar to". Cross-references point at committed files that exist (`settle-endpoint.ts`, `SettlementLog.tsx`, `0001_init.sql`).

**Type consistency:** `microUsdForRequest` (Task 1) consumed in Tasks 4, 12. `Requirements`/`buildRequirements` exported from `settle-endpoint.ts` (verified present) and consumed in Task 3. `Executors`/`TOOL_DEFS` (Task 8) consumed in Tasks 11–12. `Brain`/`Block`/`Msg`/`BrainTurn` (Task 10) consumed in Task 11. `RunWriter`/`startRun` (Task 9) consumed in Tasks 11–12. `Guardrails` API (Task 7) consumed in Tasks 11–12. `GatewayClient.pay`/`getBalances` shapes match the installed `@circle-fin/x402-batching` client types.

**Known planning-time assumptions to confirm during execution** (do not block):
1. `@anthropic-ai/sdk` accepts `output_config: {effort}` + `thinking: {type:"adaptive"}` on the installed version (Task 6/10 — re-check `claude-api` skill if `build` fails).
2. `GatewayClient.pay(url, {method:"POST"})` runs the full 402→sign→retry against `/egress` as a single discrete purchase and surfaces the JSON body as `data` (spec §10; exercised live in Task 15). If the facilitator rejects a verify-then-settle gap (the refund-policy ordering), fall back to settle-then-best-effort and note it.
3. Supabase `agent-schema.test.ts` string-assert style matches the existing `supabase-schema.test.ts` (Task 5 — adjust assertions if the existing test reads the SQL differently).
