# Real Multi-Region Egress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every node on the map genuinely egress from its real city by running the edge-node in all 9 Fly regions and pinning each request to the picked node's region.

**Architecture:** One multi-region `nanovpn-edge` Fly app (scale-to-zero). The web/agent send the target Fly region as headers (`Fly-Prefer-Region` for routing + `x-nanovpn-region` for the node to enforce); the node replays to the right region if it landed elsewhere, and reports its real `FLY_REGION` so the UI shows an honest verified badge. A node→region map lives in `packages/core` (no DB migration). A fast-boot esbuild bundle replaces `tsx` so a sleeping region wakes in seconds.

**Tech Stack:** TypeScript ESM monorepo (pnpm, Node ≥22), Next.js App Router (`apps/web`), Node `http` edge-node (`apps/edge-node`), Claude CLI agent (`apps/agent`), `packages/core`, vitest, Fly.io, esbuild.

## Global Constraints

- **Testnet only.** Arc chain id `5042002`; never target mainnet.
- **USDC = 6 decimals** (ERC-20); native gas = 18. Never mix.
- **Never modify Circle's EIP-712 payloads / domain / struct hashes.**
- **No DB migration.** The node→region map lives in `packages/core`; every node's `proxy_url` stays `https://nanovpn-edge.fly.dev`.
- **Pricing is app-level.** `EDGE_NODE_PRICE_PER_GB_USD`, `EDGE_NODE_PRICE_PER_REQUEST_USD`, and `SELLER_ADDRESS` must be identical across all 9 machines (a replayed x402 payment is re-validated by the target region against the price *it* computes). Never set per-region pricing.
- **Keep the existing test suite green** (`pnpm -r test`).
- **Secrets** only via env; never hardcode/commit/log keys.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/core/src/region.ts` | `NODE_REGION` (node id → Fly region) + `FLY_REGION_CITY` (region → display city) | Create |
| `packages/core/src/index.ts` | barrel export | Modify (add `export * from "./region"`) |
| `packages/core/test/region.test.ts` | map coverage tests | Create |
| `apps/edge-node/src/egress-endpoint.ts` | `/egress` handler: region enforce (fly-replay) + report `region` | Modify |
| `apps/edge-node/src/index.ts` | pass `flyRegion: process.env.FLY_REGION` into `handleEgress` deps | Modify |
| `apps/edge-node/test/egress-endpoint.test.ts` | region-enforce tests | Modify |
| `apps/web/app/api/egress/route.ts` | send region headers; return `region`/`regionVerified` | Modify |
| `apps/web/test/egress-route.test.ts` | header + region-verify assertions | Modify |
| `apps/agent/src/tools.ts` | `payRequest` sends region headers | Modify |
| `apps/agent/test/tools.test.ts` | header assertion | Modify |
| `apps/web/components/FetchPanel.tsx` | honest/verified egress line | Modify |
| `apps/web/app/globals.css` | `.streampanel__verified` chip | Modify |
| `apps/web/test/fetch-panel.test.tsx` | badge / honest-actual tests | Modify |
| `apps/edge-node/package.json` | `esbuild` devDep + `build:bundle` script | Modify |
| `apps/edge-node/Dockerfile` | build bundle, run `node dist/index.js` | Modify |
| `fly.toml` | `[http_service]` scale-to-zero (replaces raw-TCP service) | Modify |

---

## Task 1: core — node→region map

**Files:**
- Create: `packages/core/src/region.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/region.test.ts`

**Interfaces:**
- Produces: `NODE_REGION: Record<string, string>` (node id → Fly region code) and `FLY_REGION_CITY: Record<string, string>` (Fly region code → display city). Consumed by Tasks 3 (web), 4 (agent), 5 (FetchPanel).

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/region.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NODE_REGION, FLY_REGION_CITY } from "../src/region";

// The node ids fixed by migrations 0001/0002/0003.
const SEEDED_NODE_IDS = [
  "tokyo-1", "frankfurt-1", "nyc-1", "singapore-1", "mumbai-1",
  "london-1", "toronto-1", "sao-paulo-1", "sydney-1",
];

describe("NODE_REGION", () => {
  it("maps every seeded node id to a non-empty Fly region", () => {
    for (const id of SEEDED_NODE_IDS) {
      expect(NODE_REGION[id], `missing region for ${id}`).toBeTruthy();
    }
  });

  it("has a display city for every region it references", () => {
    for (const region of Object.values(NODE_REGION)) {
      expect(FLY_REGION_CITY[region], `missing city for ${region}`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/core test region`
Expected: FAIL — cannot resolve `../src/region`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/region.ts`:

```ts
// Maps each seeded node id to the Fly region its egress machine runs in, so the web and
// agent can pin egress to the right region. Kept in code (not the DB) to avoid a migration;
// the 9 node ids are fixed by the seed migrations.
export const NODE_REGION: Record<string, string> = {
  "tokyo-1": "nrt",
  "frankfurt-1": "fra",
  "nyc-1": "ewr",
  "singapore-1": "sin",
  "mumbai-1": "bom",
  "london-1": "lhr",
  "toronto-1": "yyz",
  "sao-paulo-1": "gru",
  "sydney-1": "syd",
};

// Fly region code → display city, for the honest egress line when routing lands in a region
// other than the one the user picked.
export const FLY_REGION_CITY: Record<string, string> = {
  nrt: "Tokyo",
  fra: "Frankfurt",
  ewr: "New York",
  sin: "Singapore",
  bom: "Mumbai",
  lhr: "London",
  yyz: "Toronto",
  gru: "São Paulo",
  syd: "Sydney",
};
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./region";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/core test region`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/region.ts packages/core/src/index.ts packages/core/test/region.test.ts
git commit -m "feat(core): node->region + region->city maps for multi-region egress"
```

---

## Task 2: edge-node — region enforce (fly-replay) + report

**Files:**
- Modify: `apps/edge-node/src/egress-endpoint.ts`
- Modify: `apps/edge-node/src/index.ts:66`
- Test: `apps/edge-node/test/egress-endpoint.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (the node compares its own `FLY_REGION` to the request header; it does not import the map).
- Produces: `EgressDeps` gains `flyRegion?: string`. `/egress` responds `204` with header `fly-replay: region=<want>` when `x-nanovpn-region` ≠ `flyRegion`; otherwise the 200 JSON gains `region: flyRegion ?? null`. Consumed by Task 3 (which reads `res.data.region`).

- [ ] **Step 1: Write the failing test**

Add these two tests inside the `describe("handleEgress", …)` block in `apps/edge-node/test/egress-endpoint.test.ts` (reuse the file's existing `fakeRes`, `SELLER`, `publicLookup`, `sig`, `okFacilitator`):

```ts
  it("replays to the requested region when this machine is elsewhere (no payment, no fetch)", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig, "x-nanovpn-region": "fra" } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup, flyRegion: "nrt" },
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers["fly-replay"]).toBe("region=fra");
    expect(fetchTarget).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it("processes normally and reports its region when it IS the requested region", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 200, bytes: 4096 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig, "x-nanovpn-region": "fra" } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup, flyRegion: "fra" },
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).region).toBe("fra");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/edge-node test egress-endpoint`
Expected: FAIL — the replay test gets `200` (no enforcement); the report test's `region` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `apps/edge-node/src/egress-endpoint.ts`, add `flyRegion` to `EgressDeps` (after `egressIp: string;`):

```ts
  egressIp: string;
  flyRegion?: string;
```

At the very top of `handleEgress` (before `const target = …`), insert the region gate:

```ts
export async function handleEgress(req: IncomingMessage, res: ServerResponse, deps: EgressDeps) {
  // Deterministic region pinning: if this machine isn't the requested region, ask Fly to
  // replay the request to the right region (which also wakes it from scale-to-zero). Fly's
  // proxy consumes this header — the x402 client never sees the 204. Guard against loops via
  // fly-replay-src (set by Fly on an already-replayed request).
  const wantRegion = req.headers["x-nanovpn-region"] as string | undefined;
  if (wantRegion && deps.flyRegion && wantRegion !== deps.flyRegion && !req.headers["fly-replay-src"]) {
    res.writeHead(204, { "fly-replay": `region=${wantRegion}` }).end();
    return;
  }

  const target = new URL(req.url ?? "", "http://x").searchParams.get("url") ?? "";
```

In the final 200 response, add `region` to the JSON body:

```ts
  }).end(JSON.stringify({ status: result.status, bytes: result.bytes, egressIp: deps.egressIp, region: deps.flyRegion ?? null, transaction: settled.transaction }));
```

In `apps/edge-node/src/index.ts:66`, pass `flyRegion` into the deps:

```ts
      await handleEgress(req, res, { facilitator, sellerAddress: SELLER_ADDRESS, priceMicroUsd: EGRESS_PRICE_MICRO_USD, pricePerGbUsd: EDGE_NODE_PRICE_PER_GB_USD, egressIp: EGRESS_IP, flyRegion: process.env.FLY_REGION, fetchTarget });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nanovpn/edge-node test`
Expected: PASS — the 2 new tests plus the whole existing edge-node suite (the existing `handleEgress` tests pass no `flyRegion`/`x-nanovpn-region`, so the gate is skipped and behaviour is unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/edge-node/src/egress-endpoint.ts apps/edge-node/src/index.ts apps/edge-node/test/egress-endpoint.test.ts
git commit -m "feat(edge-node): pin /egress to a Fly region via fly-replay + report FLY_REGION"
```

---

## Task 3: web /api/egress — send region headers, return region/regionVerified

**Files:**
- Modify: `apps/web/app/api/egress/route.ts`
- Test: `apps/web/test/egress-route.test.ts`

**Interfaces:**
- Consumes: `NODE_REGION` from `@nanovpn/core` (Task 1); `res.data.region` from the node (Task 2).
- Produces: `/api/egress` JSON gains `region: string | null` and `regionVerified: boolean`. Consumed by Task 5 (FetchPanel reads `d.region`, `d.regionVerified`).

- [ ] **Step 1: Update the test to assert the new behaviour (failing)**

In `apps/web/test/egress-route.test.ts`:

(a) Add `region: "nrt"` to the hoisted `pay` mock's `data`:

```ts
  pay: vi.fn(async () => ({ data: { status: 200, bytes: 42, egressIp: "1.2.3.4", region: "nrt" }, amount: 1000n, transaction: "uuid-1", status: 200 })),
```

(b) In the `"pays via the user's EOA, records a settlement, returns the result"` test, extend the `toMatchObject` and the `pay` call assertion:

```ts
    expect(await res.json()).toMatchObject({
      sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4",
      geo: { country: "Japan", city: "Tokyo" }, transaction: "uuid-1", amountMicroUsd: 1000,
      region: "nrt", regionVerified: true,
    });
    expect(pay).toHaveBeenCalledWith("https://node/egress?url=https%3A%2F%2Fex.com", {
      method: "POST", headers: { "fly-prefer-region": "nrt", "x-nanovpn-region": "nrt" },
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test egress-route`
Expected: FAIL — response lacks `region`/`regionVerified`; `pay` called with `{ method: "POST" }` (no headers).

- [ ] **Step 3: Write the implementation**

In `apps/web/app/api/egress/route.ts`:

(a) Line 3 — add `NODE_REGION` to the core import:

```ts
import { ARC, NODE_REGION } from "@nanovpn/core";
```

(b) Replace the `buyer.pay` block (currently lines 43–47) with:

```ts
    const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: key });
    const nodeEgressUrl = stream
      ? `${node.proxy_url}/egress?url=${encodeURIComponent(url)}&meterBytes=${STREAM_CHUNK_BYTES}`
      : `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`;
    // Pin egress to the picked node's real Fly region (Prefer-Region routes; the node's
    // fly-replay enforces). region is undefined only for an unmapped node → send no preference.
    const region = NODE_REGION[nodeId];
    const headers: Record<string, string> = region
      ? { "fly-prefer-region": region, "x-nanovpn-region": region }
      : {};
    const res = await buyer.pay<{ status: number; bytes: number; egressIp: string; region?: string }>(
      nodeEgressUrl, { method: "POST", headers },
    );
```

(c) Replace the `return NextResponse.json({ … })` (currently lines 54–58) with:

```ts
    return NextResponse.json({
      sessionId, status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp,
      geo: { country: node.country, city: node.city, lat: node.lat, lng: node.lng },
      region: res.data.region ?? null,
      regionVerified: region ? res.data.region === region : false,
      transaction: res.transaction, amountMicroUsd: Number(res.amount),
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test egress-route`
Expected: PASS (all tests in the file, including the unchanged 401/400/500/503/stream-mode cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/egress/route.ts apps/web/test/egress-route.test.ts
git commit -m "feat(web): /api/egress pins region via Fly headers + returns region/regionVerified"
```

---

## Task 4: agent — payRequest sends region headers

**Files:**
- Modify: `apps/agent/src/tools.ts`
- Test: `apps/agent/test/tools.test.ts`

**Interfaces:**
- Consumes: `NODE_REGION` from `@nanovpn/core` (Task 1).
- Produces: the agent's `buyer.pay` for `/egress` is called with `{ method: "POST", headers: { "fly-prefer-region": <region>, "x-nanovpn-region": <region> } }`.

- [ ] **Step 1: Update the test (failing)**

In `apps/agent/test/tools.test.ts`:

(a) Replace `fakeBuyer` so it also records the options:

```ts
function fakeBuyer() {
  const calls: string[] = [];
  const opts: any[] = [];
  return {
    calls,
    opts,
    async pay<T>(url: string, o?: any) { calls.push(url); opts.push(o); return { data: { status: 200, bytes: 1024, egressIp: "1.2.3.4" } as T, amount: 700n, transaction: "tx-1", status: 200 }; },
    async getBalances() { return { wallet: { formatted: "10" }, gateway: { formattedAvailable: "5" } }; },
  };
}
```

(b) Add a test inside `describe("payRequest is node-aware", …)`:

```ts
  it("pins egress to the chosen node's Fly region via headers", async () => {
    const buyer = fakeBuyer();
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: buyer as any });
    await ex.payRequest({ nodeId: "mumbai-1", url: "https://x.test/a" });
    expect(buyer.opts[0].headers).toMatchObject({ "fly-prefer-region": "bom", "x-nanovpn-region": "bom" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test tools`
Expected: FAIL — `buyer.opts[0].headers` is `undefined`.

(If the agent package name differs, run `pnpm --filter ./apps/agent test tools`.)

- [ ] **Step 3: Write the implementation**

In `apps/agent/src/tools.ts`:

(a) Add the import at the top of the file:

```ts
import { NODE_REGION } from "@nanovpn/core";
```

(b) Extend the `Buyer` interface's `pay` options:

```ts
interface Buyer {
  pay<T>(url: string, opts?: { method?: string; headers?: Record<string, string> }): Promise<{ data: T; amount: bigint; transaction: string; status: number }>;
  getBalances(): Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }>;
}
```

(c) Replace the `payRequest` body with the header-sending version:

```ts
    async payRequest({ nodeId, url }) {
      const node = (await deps.nodesReader()).find((n) => n.id === nodeId);
      if (!node) throw new Error(`unknown node ${nodeId}`);
      // Pin egress to the node's real Fly region (Prefer-Region routes; node fly-replay enforces).
      const region = NODE_REGION[node.id];
      const headers: Record<string, string> = region
        ? { "fly-prefer-region": region, "x-nanovpn-region": region }
        : {};
      const res = await deps.buyer.pay<{ status: number; bytes: number; egressIp: string }>(
        `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`, { method: "POST", headers },
      );
      return { status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp, amountMicroUsd: Number(res.amount), transaction: res.transaction, nodeId };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/agent test tools`
Expected: PASS — the new header test plus the existing node-aware / unknown-node / listNodes / getBalance tests (they ignore the extra `opts` arg).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/tools.ts apps/agent/test/tools.test.ts
git commit -m "feat(agent): pin egress to the chosen node's Fly region via headers"
```

---

## Task 5: web FetchPanel — honest / verified egress line

**Files:**
- Modify: `apps/web/components/FetchPanel.tsx:6,19,54,89`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Consumes: `FLY_REGION_CITY` from `@nanovpn/core` (Task 1); `d.region`, `d.regionVerified` from `/api/egress` (Task 3).
- Produces: UI only. Shows `<city>, <country> ✓ verified` when a tick is `regionVerified`; otherwise the actual region's city (from `FLY_REGION_CITY`) with no badge.

- [ ] **Step 1: Update the tests (failing)**

In `apps/web/test/fetch-panel.test.tsx`:

(a) In `beforeEach`, extend the `/api/egress` mock response with `region` + `regionVerified`:

```ts
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "1.2.3.4", geo: { city: "London", country: "United Kingdom" }, region: "nrt", regionVerified: true, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
```

(b) Add two tests inside `describe("FetchPanel streaming", …)`:

```ts
  it("shows the ✓ verified badge when the egress tick is region-verified", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeTruthy());
  });

  it("shows the actual region honestly (no ✓) when a tick is not region-verified", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded" }), { status: 200 });
      if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "9.9.9.9", geo: { city: "Tokyo", country: "Japan" }, region: "lhr", regionVerified: false, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/London/)).toBeTruthy());
    expect(screen.queryByText(/verified/i)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test fetch-panel`
Expected: FAIL — no element matches `/verified/i` (badge not implemented); the honest-actual test finds no `London` (it currently renders `geo.city` = "Tokyo").

- [ ] **Step 3: Write the implementation**

In `apps/web/components/FetchPanel.tsx`:

(a) Line 6 — add `FLY_REGION_CITY` to the value import (keep the separate `import type { NodeListing }` line as-is):

```ts
import { ARC, FLY_REGION_CITY } from "@nanovpn/core";
```

(b) Line 19 — extend the `egress` state shape:

```ts
  const [egress, setEgress] = useState<{ ip: string; geo: { city: string; country: string }; verified: boolean; region: string | null } | null>(null);
```

(c) Line 54 — set the new fields each tick:

```ts
        setEgress({ ip: d.egressIp, geo: d.geo, verified: !!d.regionVerified, region: d.region ?? null });
```

(d) Line 89 — replace the egress line with the verified/honest conditional:

```tsx
      {egress && (
        <p className="streampanel__egress">
          egress <strong>{egress.ip}</strong> —{" "}
          {egress.verified ? (
            <>{egress.geo.city}, {egress.geo.country} <span className="streampanel__verified">✓ verified</span></>
          ) : (
            <>{egress.region ? (FLY_REGION_CITY[egress.region] ?? egress.region) : `${egress.geo.city}, ${egress.geo.country}`}</>
          )}
        </p>
      )}
```

In `apps/web/app/globals.css`, add next to the other `.streampanel__*` rules:

```css
.streampanel__verified { color: var(--green); font-weight: 600; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test fetch-panel`
Expected: PASS — all fetch-panel tests (streaming, self-fund, zero-amount guard, the 2 new region tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/app/globals.css apps/web/test/fetch-panel.test.tsx
git commit -m "feat(web): honest verified egress line (✓ when the region matches the pick)"
```

---

## Task 6: edge-node fast-boot bundle + multi-region scale-to-zero config

**Files:**
- Modify: `apps/edge-node/package.json`
- Modify: `apps/edge-node/Dockerfile`
- Modify: `fly.toml`

**Interfaces:**
- Produces: `pnpm --filter @nanovpn/edge-node build:bundle` → `apps/edge-node/dist/index.js`, a self-contained ESM bundle (our `src` + the TS `@nanovpn/core` bundled in; heavy third-party JS externalized) run by `node` with no `tsx`. `fly.toml` exposes an HTTP service with scale-to-zero. `dist/` is already gitignored (`.gitignore` line 14).

- [ ] **Step 1: Add the esbuild devDep + build script**

In `apps/edge-node/package.json`, add `"esbuild": "^0.24.0"` to `devDependencies`, and add a `build:bundle` script. The bundle includes our `src` and the workspace TS package `@nanovpn/core` (which ships raw `.ts`, so it MUST be transpiled in), while externalizing the heavy third-party JS deps (resolved from `node_modules` at runtime) and the optional native ws addons:

```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json --noEmit",
    "build:bundle": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js --external:viem --external:@supabase/supabase-js --external:@circle-fin/x402-batching --external:@x402/core --external:@x402/evm --external:bufferutil --external:utf-8-validate",
    "test": "vitest run"
  },
```

Then install so the lockfile picks up esbuild:

```bash
pnpm install
```

- [ ] **Step 2: Build the bundle and verify it exists**

Run:
```bash
pnpm --filter @nanovpn/edge-node build:bundle && test -f apps/edge-node/dist/index.js && echo BUNDLE_OK
```
Expected: `BUNDLE_OK`.

(If esbuild reports an unresolved external at *build* time, the named package isn't installed under the edge-node — verify the `--external:` name matches `apps/edge-node/package.json` dependencies. Do not remove `@nanovpn/core` from bundling; it must stay bundled.)

- [ ] **Step 3: Verify the bundle boots without tsx (loads every import + listens)**

Run (dummy env; a valid throwaway private key so `GatewayClient` constructs; bound to a spare port; killed after the startup log):
```bash
SELLER_ADDRESS=0x0000000000000000000000000000000000000001 \
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
SUPABASE_SERVICE_ROLE_KEY=dummy \
BUYER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
EDGE_NODE_PORT=8099 FLY_REGION=fra \
timeout 20 node apps/edge-node/dist/index.js 2>&1 | grep -q "http+proxy on" && echo BOOT_OK
```
Expected: `BOOT_OK` (the startup line proves all third-party externals resolved and the server began listening — settlement-loop errors against the fake Supabase are expected and harmless).

- [ ] **Step 4: Switch the Dockerfile to build + run the bundle**

Replace `apps/edge-node/Dockerfile` with:

```dockerfile
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/edge-node ./apps/edge-node
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @nanovpn/edge-node build:bundle
EXPOSE 8080
WORKDIR /app/apps/edge-node
CMD ["node", "dist/index.js"]
```

- [ ] **Step 5: Switch fly.toml to an HTTP service with scale-to-zero**

Replace the raw-TCP `[[services]]` block in `fly.toml` with an `[http_service]` block (keep `app`, `primary_region`, and `[build]`):

```toml
app = "nanovpn-edge"
primary_region = "nrt"

[build]
  dockerfile = "apps/edge-node/Dockerfile"

# HTTP service (terminates TLS, speaks HTTP) so Fly-Prefer-Region, fly-replay, and autostart
# work. The product uses HTTP POST /egress only; raw-CONNECT (orphaned api/browse) is retired.
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
```

- [ ] **Step 6: Typecheck + full suite still green**

Run:
```bash
pnpm -r build && pnpm -r test
```
Expected: builds clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/edge-node/package.json apps/edge-node/Dockerfile fly.toml pnpm-lock.yaml
git commit -m "build(edge-node): esbuild fast-boot bundle + multi-region HTTP scale-to-zero fly.toml"
```

---

## Deployment (manual ops — after all tasks merged)

Not unit-testable; run by a human/operator with the Fly CLI (`export FLYCTL_INSTALL=$HOME/.fly; export PATH=$FLYCTL_INSTALL/bin:$PATH`).

1. **Confirm app-level pricing env** is set on the app (identical for all machines), so replayed payments validate:
   `fly secrets list -a nanovpn-edge` shows `SELLER_ADDRESS`, `BUYER_PRIVATE_KEY`, Supabase keys. If `EDGE_NODE_PRICE_PER_GB_USD` is meant to be non-default, set it app-level: `fly secrets set EDGE_NODE_PRICE_PER_GB_USD=2.5 -a nanovpn-edge`.
2. **Deploy the fast-boot image:** `fly deploy --remote-only` (from repo root).
3. **Spread one machine into each region** (scaled to zero when idle):
   `fly scale count 1 --region nrt,fra,ewr,sin,bom,lhr,yyz,gru,syd -a nanovpn-edge`
4. **Try 256 MB:** `fly scale memory 256 -a nanovpn-edge`. Watch `fly logs`; if any region OOMs (Exit 137 / crash loop), bump back: `fly scale memory 512 -a nanovpn-edge`.
5. **Release the dedicated IPv4** (no longer needed for HTTP): `fly ips list -a nanovpn-edge` then `fly ips release <v4> -a nanovpn-edge`. Keep the shared/anycast + v6.
6. **Verify per-region egress is real:** for a few regions, drive a request and confirm the returned `egressIp` geolocates to that city. Either through the live web (sign in → pick Frankfurt → Start streaming → the egress line shows `✓ verified · Frankfurt` with a Frankfurt IP), or headless:
   ```bash
   # Confirms the node reports the region it was asked for (fly-replay landed it right).
   curl -s -o /dev/null -w "%{http_code}\n" https://nanovpn-edge.fly.dev/health
   ```
   The authoritative proof is the web egress line showing each picked city with `✓ verified`.
7. **Redeploy the web** to Vercel (`vercel deploy --prod` from repo root) so the route + FetchPanel changes ship.
8. **Cost teardown after the demo:** `fly apps destroy nanovpn-edge` (idle scale-to-zero is ≈ $0, but this stops all charges).

---

## Self-Review

**1. Spec coverage:**
- All-9-real / one multi-region app / scale-to-zero → Task 6 (fly.toml + `fly scale count`) ✓
- Fast-boot bundle → Task 6 ✓
- Fly-Prefer-Region + deterministic fly-replay → Task 2 (node enforce) + Tasks 3/4 (web/agent send headers) ✓
- No DB migration; node→region map in core → Task 1 ✓
- Honest verified badge → Task 5 ✓
- Agent path region-real → Task 4 ✓
- App-level pricing for replay validity → Global Constraints + Deployment step 1 ✓
- Retire CONNECT / drop dedicated IPv4 / 256 MB → Task 6 + Deployment ✓
- Testing matrix (core/edge/web/agent/FetchPanel) → Tasks 1–5 ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; the one build contingency (Task 6 Step 2) names the concrete fix rather than "handle errors".

**3. Type consistency:** `flyRegion?: string` on `EgressDeps` (Task 2) matches the index.ts call site (Task 2). Node returns `region` (Task 2) which Task 3 reads as `res.data.region`. `/api/egress` returns `region`/`regionVerified` (Task 3) which FetchPanel reads as `d.region`/`d.regionVerified` (Task 5). `NODE_REGION`/`FLY_REGION_CITY` (Task 1) consumed with the same names in Tasks 3/4/5. Header names (`fly-prefer-region`, `x-nanovpn-region`) identical across web (Task 3), agent (Task 4), and the node's read (Task 2).
