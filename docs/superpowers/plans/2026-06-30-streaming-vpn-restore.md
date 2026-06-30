# Restore streaming VPN payments + UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-click `/egress` fetch with a continuous **streaming** model — a client-driven loop of per-user nanopayments that meters data used (per-byte) and settles via Gateway while connected, with a live counter — and restore the professional dark-rail UI.

**Architecture:** A client loop POSTs `/api/egress` in a new `stream` mode each tick; the route drives a fixed-size chunk through the node and settles a per-user nanopayment priced **per-byte** (an additive edge-node `meterBytes` pricing flag). The connected-rail panel becomes a streaming panel: big live counter (data used + spend), rate control, honest egress IP/geo, restyled readable controls, kept self-fund.

**Tech Stack:** Node http edge-node, Next.js route handlers, `@circle-fin/x402-batching/client` (`GatewayClient`), viem, wagmi, vitest.

Implements spec `docs/superpowers/specs/2026-06-30-streaming-vpn-restore-design.md`. Builds on prod `main` `f802cc1` (Plans 1/2/hardening/2b live).

## Global Constraints

- **Testnet only** (Arc `eip155:5042002`); per-user signing stays server-side (browser never gets a key); secrets from env.
- **Additive edge-node change:** `/egress` keeps the flat per-request price unless the URL has `meterBytes=N` (positive int) → price `microUsdForBytes(N, EDGE_NODE_PRICE_PER_GB_USD)`. The agent path (no `meterBytes`) is unchanged.
- **Stream chunk:** `STREAM_CHUNK_BYTES` default **262144** (256 KB); **`EDGE_NODE_PRICE_PER_GB_USD`** default **2.5**.
- **Streaming is client-driven** (loop in the panel; the web signs each tick with the user's key — the existing `/egress` per-user path). The hardening **503 cap-gate** still fires per tick.
- **Honest egress geo:** show the egress IP's real geo (the node DB row), not a mislabel. Real per-region egress = Plan 3 (out of scope).
- **Verbatim imports:** `import { GatewayClient } from "@circle-fin/x402-batching/client";` · `import { ARC } from "@nanovpn/core";` · `microUsdForBytes` from `@nanovpn/core` · `intervalForIntensity`, `type Intensity` from `@/lib/traffic`.
- **Existing patterns:** route handlers `runtime="nodejs"` + `NextRequest`; client loop mirrors the old `apps/web/lib/traffic.ts` (AbortController + `inFlight` no-overlap guard); tests mock the imported libs; readable dark-rail colors match the existing `.maprail` styling.
- **Deploy:** this needs an **edge-node Fly redeploy** (`fly deploy --remote-only` from repo root) **and** a web Vercel deploy.

## File structure

| File | Change |
|------|--------|
| `apps/edge-node/src/egress-endpoint.ts` (modify) | `egressPrice()` helper + `EgressDeps.pricePerGbUsd`; price per-byte when `meterBytes` present |
| `apps/edge-node/src/index.ts` (modify) | `EDGE_NODE_PRICE_PER_GB_USD` env → pass `pricePerGbUsd` to `handleEgress` deps |
| `apps/web/app/api/egress/route.ts` (modify) | `stream` mode: sized chunk + `&meterBytes` |
| `apps/web/components/FetchPanel.tsx` (rewrite) | streaming loop + live counter + rate + honest egress line + kept self-fund; drop per-click |
| `apps/web/components/MapRail.tsx` (modify) | pass `streaming`/`intensity`/`onToggleStream`/`onIntensity` to the panel |
| `apps/web/app/globals.css` (modify) | dark-rail readable streaming-panel styles + consistent buttons |
| `.env.example` (modify) | `EDGE_NODE_PRICE_PER_GB_USD`, `STREAM_CHUNK_BYTES` |
| `apps/web/test/*`, `apps/edge-node/test/*` | per tasks |

---

## Task 1: Edge-node per-byte pricing (`meterBytes`)

**Files:**
- Modify: `apps/edge-node/src/egress-endpoint.ts`
- Modify: `apps/edge-node/src/index.ts`
- Test: `apps/edge-node/test/egress-price.test.ts`

**Interfaces:**
- Produces: `egressPrice(rawUrl: string, flatMicroUsd: number, pricePerGbUsd: number): number` — `microUsdForBytes(meterBytes, pricePerGbUsd)` when the URL has a positive `meterBytes`, else `flatMicroUsd`. `EgressDeps` gains `pricePerGbUsd: number`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/edge-node/test/egress-price.test.ts
import { describe, it, expect } from "vitest";
import { egressPrice } from "../src/egress-endpoint";
import { microUsdForBytes } from "@nanovpn/core";

describe("egressPrice", () => {
  it("prices per-byte when meterBytes is present", () => {
    const url = "/egress?url=https%3A%2F%2Fx&meterBytes=1000000";
    expect(egressPrice(url, 1000, 2.5)).toBe(microUsdForBytes(1_000_000, 2.5));
  });
  it("falls back to the flat price without meterBytes", () => {
    expect(egressPrice("/egress?url=https%3A%2F%2Fx", 1000, 2.5)).toBe(1000);
  });
  it("ignores a non-positive meterBytes", () => {
    expect(egressPrice("/egress?url=x&meterBytes=0", 1000, 2.5)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/edge-node test -- egress-price`
Expected: FAIL — `egressPrice` not exported.

- [ ] **Step 3: Implement in `egress-endpoint.ts`**

Add the import + helper at the top (after the existing imports):
```ts
import { microUsdForBytes } from "@nanovpn/core";

/** Per-byte price when the request carries meterBytes=N (streaming chunk); else the flat per-request price. */
export function egressPrice(rawUrl: string, flatMicroUsd: number, pricePerGbUsd: number): number {
  const n = Number(new URL(rawUrl, "http://x").searchParams.get("meterBytes") ?? 0);
  return n > 0 ? microUsdForBytes(n, pricePerGbUsd) : flatMicroUsd;
}
```
Add `pricePerGbUsd: number;` to the `EgressDeps` interface. In `handleEgress`, replace:
```ts
  const requirements = buildRequirements(deps.priceMicroUsd, deps.sellerAddress);
```
with:
```ts
  const priceMicroUsd = egressPrice(req.url ?? "", deps.priceMicroUsd, deps.pricePerGbUsd);
  const requirements = buildRequirements(priceMicroUsd, deps.sellerAddress);
```

- [ ] **Step 4: Wire the env in `index.ts`**

Add near `EGRESS_PRICE_MICRO_USD`:
```ts
const EDGE_NODE_PRICE_PER_GB_USD = Number(process.env.EDGE_NODE_PRICE_PER_GB_USD ?? 2.5);
```
In the `handleEgress` call's deps object, add `pricePerGbUsd: EDGE_NODE_PRICE_PER_GB_USD,`.

- [ ] **Step 5: Document the env**

In `.env.example` add: `EDGE_NODE_PRICE_PER_GB_USD=2.5   # per-byte streaming price (meterBytes); flat per-request stays for agents`

- [ ] **Step 6: Run tests + build**

Run: `pnpm --filter @nanovpn/edge-node test` then `pnpm --filter @nanovpn/edge-node build`
Expected: PASS; build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/edge-node/src/egress-endpoint.ts apps/edge-node/src/index.ts apps/edge-node/test/egress-price.test.ts .env.example
git commit -m "feat(edge-node): opt-in per-byte /egress pricing via meterBytes (for streaming)"
```

---

## Task 2: Web `/api/egress` stream mode

**Files:**
- Modify: `apps/web/app/api/egress/route.ts`
- Modify: `apps/web/test/egress-route.test.ts`

**Interfaces:**
- Produces: `POST /api/egress` accepts `{ nodeId, sessionId?, stream: true }` (no `url`) — drives a `STREAM_CHUNK_BYTES` chunk through the node with `&meterBytes`, settling a per-byte nanopayment. The existing `{ nodeId, url }` path is unchanged.

- [ ] **Step 1: Update the test**

In `apps/web/test/egress-route.test.ts`, add a stream-mode test (the existing mocks for `GatewayClient.pay`, supabase nodes/insert, `ensureProvisionedAndFunded`→funded stay):
```ts
it("stream mode prices a sized chunk per-byte (meterBytes on the node URL)", async () => {
  const res = await POST(req({ nodeId: "tokyo-1", stream: true }, "siwe-address=0xABC"));
  expect(res.status).toBe(200);
  const calledUrl = pay.mock.calls[0][0] as string;
  expect(calledUrl).toContain("/egress?url=");
  expect(calledUrl).toContain("meterBytes=262144");
  expect(calledUrl).toContain(encodeURIComponent("speed.cloudflare.com/__down?bytes=262144"));
});
```
(If the existing 401/400/funded tests pass `{ nodeId, url }`, leave them; the new test exercises the `stream` branch.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- egress-route`
Expected: FAIL — stream mode 400s (no `url`) / no `meterBytes`.

- [ ] **Step 3: Implement the stream branch**

In `apps/web/app/api/egress/route.ts`, add the chunk constant after the imports:
```ts
const STREAM_CHUNK_BYTES = Number(process.env.STREAM_CHUNK_BYTES) || 262144;
```
Replace the `url` parse + validation (lines 17-19) with:
```ts
  const nodeId = String(body?.nodeId ?? "");
  const stream = Boolean(body?.stream);
  const url = stream
    ? `https://speed.cloudflare.com/__down?bytes=${STREAM_CHUNK_BYTES}`
    : String(body?.url ?? "").trim();
  if (!nodeId || !url) return NextResponse.json({ error: "nodeId and (url or stream) are required" }, { status: 400 });
```
Replace the `buyer.pay(...)` URL (line 39-41) with a `meterBytes`-aware URL:
```ts
    const nodeEgressUrl = stream
      ? `${node.proxy_url}/egress?url=${encodeURIComponent(url)}&meterBytes=${STREAM_CHUNK_BYTES}`
      : `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`;
    const res = await buyer.pay<{ status: number; bytes: number; egressIp: string }>(nodeEgressUrl, { method: "POST" });
```
(everything else — auth, 503 gate, settlement insert, response shape — unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- egress-route`
Expected: PASS (new stream test + existing cases).

- [ ] **Step 5: Document the env**

In `.env.example` add: `STREAM_CHUNK_BYTES=262144   # bytes per streaming tick (web)`

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/egress/route.ts apps/web/test/egress-route.test.ts .env.example
git commit -m "feat(web): /api/egress stream mode — sized chunk + per-byte meterBytes"
```

---

## Task 3: FetchPanel → streaming panel (+ MapRail wiring)

**Files:**
- Rewrite: `apps/web/components/FetchPanel.tsx`
- Modify: `apps/web/components/MapRail.tsx`
- Test: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/egress {stream:true}` (Task 2); `GET /api/wallet`; `/api/self-fund`; `intervalForIntensity`/`Intensity` from `@/lib/traffic`; wagmi.
- Produces: `FetchPanel({ node, streaming, intensity, onToggleStream, onIntensity })` — runs the streaming loop when `streaming`, accumulates a live counter, shows the honest egress line, keeps the self-fund control, renders `SettlementLog`.

- [ ] **Step 1: Rewrite the test**

Replace `apps/web/test/fetch-panel.test.tsx` with (keeps the wagmi + fetch mocks, drops per-click, adds streaming + keeps self-fund):
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));
const writeContractAsync = vi.fn(async () => "0xhash");
const waitForTransactionReceipt = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0xmeta" }),
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerGbUsd: 2.5 } as any;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded" }), { status: 200 });
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "1.2.3.4", geo: { city: "London", country: "United Kingdom" }, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 2_000_000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

const noop = () => {};

describe("FetchPanel streaming", () => {
  it("streams when `streaming` is on: ticks /api/egress and accumulates the counter + egress + tape", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy());           // egress IP shown
    await waitFor(() => expect(screen.getByText(/0\.26 MB/)).toBeTruthy());             // 262144 bytes ≈ 0.26 MB
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();
  });

  it("does not stream when `streaming` is off", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/wallet"))).toBe(true));
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(false);
  });

  it("self-funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Fund from your wallet/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Fund from your wallet/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- fetch-panel`
Expected: FAIL — component doesn't stream / props changed.

- [ ] **Step 3: Rewrite `FetchPanel.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import type { NodeListing } from "@nanovpn/core";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";
import { intervalForIntensity, type Intensity } from "@/lib/traffic";

export function FetchPanel({ node, streaming, intensity, onToggleStream, onIntensity }: {
  node: NodeListing; streaming: boolean; intensity: Intensity;
  onToggleStream(): void; onIntensity(i: Intensity): void;
}) {
  const [balance, setBalance] = useState<{ eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [streamSpent, setStreamSpent] = useState(0);
  const [egress, setEgress] = useState<{ ip: string; geo: { city: string; country: string } } | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function refreshWallet() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setBalance(d);
  }
  useEffect(() => { refreshWallet(); }, []);

  // Streaming loop: while `streaming`, drive a metered chunk per tick (mirrors lib/traffic.ts).
  useEffect(() => {
    if (!streaming) return;
    const ctrl = new AbortController();
    let inFlight = false;
    const tick = async () => {
      if (inFlight || ctrl.signal.aborted) return;
      inFlight = true;
      try {
        const r = await fetch("/api/egress", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId: node.id, sessionId, stream: true }), signal: ctrl.signal,
        });
        const d = await r.json();
        if (!r.ok) { setStreamErr(d.error ?? "stream paused"); return; }
        setStreamErr(null);
        setSessionId(d.sessionId);
        setBytesUsed((b) => b + d.bytes);
        setStreamSpent((s) => s + d.amountMicroUsd);
        setEgress({ ip: d.egressIp, geo: d.geo });
        setBalance((b) => (b ? { ...b, spentMicroUsd: b.spentMicroUsd + d.amountMicroUsd } : b));
      } catch { /* aborted / soft-fail */ } finally { inFlight = false; }
    };
    void tick();
    const id = setInterval(() => void tick(), intervalForIntensity(intensity));
    return () => { ctrl.abort(); clearInterval(id); };
  }, [streaming, intensity, sessionId, node.id]);

  async function selfFund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!balance || !publicClient) return;
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [balance.eoaAddress as `0x${string}`, parseUnits(amount, ARC.usdcDecimals)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const r = await fetch("/api/self-fund", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setFundErr(d.error ?? "self-fund failed"); return; }
      await refreshWallet();
    } catch (e) { setFundErr((e as Error).message); } finally { setFunding(false); }
  }

  const remaining = balance ? balance.fundedMicroUsd - balance.spentMicroUsd : 0;
  const RATES: Intensity[] = ["light", "medium", "heavy"];
  return (
    <div className="streampanel">
      <div className="streampanel__counter">
        <div className="streampanel__spend">{formatUsd(streamSpent)}</div>
        <div className="streampanel__label">STREAMING SPEND</div>
        <div className="streampanel__data">{(bytesUsed / 1_000_000).toFixed(2)} MB used</div>
      </div>
      {egress && <p className="streampanel__egress">egress <strong>{egress.ip}</strong> — {egress.geo.city}, {egress.geo.country}</p>}

      <button className="btn btn--primary streampanel__toggle" onClick={onToggleStream}>
        {streaming ? "Stop streaming" : "Start streaming"}
      </button>
      <div className="streampanel__rates">
        {RATES.map((i) => (
          <button key={i} className={`btn btn--ghost ${intensity === i ? "is-active" : ""}`} onClick={() => onIntensity(i)}>{i}</button>
        ))}
      </div>
      {streamErr && <p className="streampanel__warn">⚠ {streamErr}</p>}

      {balance && (
        <p className="streampanel__bal">Balance <strong>{formatUsd(remaining)}</strong> <span className="streampanel__sub">of {formatUsd(balance.fundedMicroUsd)} funded</span></p>
      )}
      <div className="streampanel__fund">
        <label className="streampanel__sub">Fund from your wallet (USDC)</label>
        <div className="streampanel__fundrow">
          <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn--secondary" disabled={funding || !isConnected || !balance} onClick={selfFund}>
            {funding ? "Funding…" : "Fund from your wallet"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>

      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
```

- [ ] **Step 4: Wire props through `MapRail.tsx`**

In `apps/web/components/MapRail.tsx`, change the connected-state `<FetchPanel node={node} />` to:
```tsx
          <FetchPanel node={node} streaming={props.streaming} intensity={props.intensity}
            onToggleStream={props.onToggleStream} onIntensity={props.onIntensity} />
```
(The `streaming`/`intensity`/`onToggleStream`/`onIntensity` props already exist on `MapRail`. The map page already toggles `streaming`, which also drives the `WorldMap` connection-line animation — so the stream and the animated line turn on together. `Disconnect` stays as is and already sets `streaming=false`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- fetch-panel map-rail`
Expected: PASS (streaming + off + self-fund; MapRail still renders).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/components/MapRail.tsx apps/web/test/fetch-panel.test.tsx
git commit -m "feat(web): streaming panel — continuous metered nanopayments + live counter (replaces per-click)"
```

---

## Task 4: Dark-rail professional styling pass

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: the `.streampanel*` + `.btn--secondary` class names produced in Task 3.

- [ ] **Step 1: Add the styles**

Append to `apps/web/app/globals.css` (match the existing `.maprail` dark palette — light text on the dark rail; reuse `--green-line`/`--green`/`--amber`/`--ink-dim` tokens as they exist; if a token is missing use the literal that the rest of `.maprail` uses). Use readable light colors so nothing is dark-on-dark:

```css
.streampanel { display: flex; flex-direction: column; gap: 12px; color: #e8f0ec; }
.streampanel__counter { text-align: center; padding: 8px 0; }
.streampanel__spend { font-size: 34px; font-weight: 700; color: var(--green); line-height: 1.1; }
.streampanel__label { font-size: 11px; letter-spacing: 0.12em; color: #9fb4ab; }
.streampanel__data { margin-top: 4px; font-size: 13px; color: #cfe0d8; }
.streampanel__egress { font-size: 12px; color: #cfe0d8; overflow-wrap: anywhere; text-align: center; }
.streampanel__egress strong { color: #e8f0ec; }
.streampanel__toggle { width: 100%; }
.streampanel__rates { display: flex; gap: 6px; }
.streampanel__rates .btn { flex: 1; text-transform: capitalize; padding: 6px 0; }
.streampanel__rates .is-active { border-color: var(--green); color: var(--green); }
.streampanel__warn { font-size: 12px; color: var(--amber); }
.streampanel__bal { font-size: 14px; color: #e8f0ec; }
.streampanel__bal strong { color: var(--green); }
.streampanel__sub { font-size: 12px; color: #9fb4ab; }
.streampanel__fund { display: flex; flex-direction: column; gap: 6px; }
.streampanel__fundrow { display: flex; gap: 8px; }
.streampanel__amt { width: 84px; }
.btn--secondary { background: #1e2a25; color: #e8f0ec; border: 1px solid var(--green-line, #2e6b54); }
.btn--secondary:hover:not(:disabled) { border-color: var(--green); }
.btn--secondary:disabled { opacity: 0.5; }
```
If `--green`, `--amber`, or `--green-line` are not defined, check `:root` in `globals.css` and substitute the actual brand green / amber literals already used by `.btn--primary` and the settlement tape.

- [ ] **Step 2: Build to confirm CSS is valid + remove the dead per-click result rule**

If a `.fetchpanel__result` / `.fetchpanel__row` / `.fetchpanel__url` rule exists in `globals.css` from Plan 2, delete those orphaned rules (the per-click result card/select are gone). Leave `.fetchpanel__*` rules only if still referenced.

Run: `pnpm -r build`
Expected: clean.

- [ ] **Step 3: Run the full suite**

Run: `pnpm -r test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): readable, professional dark-rail styling for the streaming panel"
```

---

## Manual verification (after all tasks + deploy)

Needs a Fly redeploy (edge-node) + Vercel deploy, then a browser pass (Martin):
1. Deploy edge-node: `fly deploy --remote-only` (from repo root); deploy web: `vercel deploy --prod`.
2. Sign in → pick a node → Connect → **Start streaming**: the counter (STREAMING SPEND + MB used) ticks up continuously, the connection line animates, and settlement nanopayments stream into the tape. Stop halts it.
3. The egress line shows the real egress IP + its real geo (one Fly box for now — honest).
4. All text/buttons readable + professional on the dark rail; "Fund from your wallet" clearly visible.
5. (Funding) self-fund still works; the streaming spend draws the balance down.

## Out of scope

Real per-region geo (Plan 3); device tunneling; reviving the raw-CONNECT proxy / edge settlement loop. Orphaned `Counter.tsx`/`traffic.ts` (except `intervalForIntensity`, still used)/`api/browse` can be removed in cleanup.

## Self-review notes (addressed)

- **Spec coverage:** per-byte edge pricing (T1); `/api/egress` stream mode (T2); streaming loop + live counter + rate + honest egress + kept self-fund + drop per-click (T3); readable professional UI (T4). All spec sections mapped.
- **Type consistency:** `egressPrice(rawUrl, flat, perGb)` (T1) used by `handleEgress`; `STREAM_CHUNK_BYTES`/`meterBytes` consistent across T1↔T2; `FetchPanel({node, streaming, intensity, onToggleStream, onIntensity})` (T3) matches the MapRail props (T3 step 4) which already exist on MapRail.
- **No placeholders:** every step has real code/commands. Chunk `262144`, per-GB `2.5`, MB display `bytes/1_000_000` are concrete. The CSS references existing tokens with a stated fallback.
