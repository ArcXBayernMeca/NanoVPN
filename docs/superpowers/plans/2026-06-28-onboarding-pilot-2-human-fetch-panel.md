# Onboarding Pilot — Plan 2: Human interactive-fetch panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user picks a node + a URL, routes a **real fetch through that node** from their **own** wallet (Plan 1's per-user EOA), and watches the response + egress IP/geo + a live per-fetch USDC settlement — replacing the synthetic "Start traffic" loop on `/map`.

**Architecture:** Reuse Plan 1's per-user wallet (provision + sponsored funding) via an extracted helper. A new authed `POST /api/egress` makes the web app the x402 buyer with the user's key (`GatewayClient.pay(node/egress?url=)` — the same path the agent uses), records a `settlements` row, and returns the result. A `GET /api/wallet` exposes the user's EOA + balance. A new `FetchPanel` drives it and reuses the existing `SettlementLog` (scoped by a lightweight session created on first fetch). The edge-node is unchanged.

**Tech Stack:** Next.js App Router route handlers, `@circle-fin/x402-batching/client` (`GatewayClient`), Supabase service-role, viem, React (client components), vitest.

This is **Plan 2 of the P1 onboarding pilot** (spec `docs/superpowers/specs/2026-06-28-onboarding-pilot-design.md`). Plan 1 (per-user wallets + agent pays from wallet) is merged + deployed (`main` `a857103`). **Out of scope here → Plan 2b:** MetaMask self-funding (browser-wallet transfer → EOA → Gateway deposit). **Plan 3:** real geo regions (until then a node's geo is its declared `nodes` row geo and all egress IPs are the one Fly node).

## Global Constraints

- **Testnet only.** Arc Testnet `eip155:5042002`. Never mainnet.
- **USDC 6 decimals** (`ARC.usdcDecimals`); the `/egress` x402 amount is atomic µUSD.
- **Never modify Circle EIP-712 types.** Reuse `GatewayClient.pay` exactly as the agent does.
- **Per-user signing stays server-side.** The browser never receives a private key; `/api/egress` decrypts the key, signs, and never returns it.
- **Auth required.** `/api/egress` and `/api/wallet` require the `siwe-address` cookie (401 otherwise); `userId = address.toLowerCase()`.
- **Reuse, don't duplicate.** The provision+fund-once logic lives in ONE helper used by the agent route and the new routes.
- **Verbatim imports:** `import { GatewayClient } from "@circle-fin/x402-batching/client";` · `import { ARC } from "@nanovpn/core";` · `supabaseService` from `@/lib/supabase-server` · `getOrCreateUserWallet`/`loadSigningKey`/`markFunded` from `@/lib/user-wallet` · `fundSponsored` from `@/lib/funding`.
- **Settlement row shape** (match the edge-node's `onSettled`): `{ session_id, settlement_uuid, amount_micro_usd, payer, payee, network: "eip155:5042002", status: "received" }`.

## File structure

| File | Responsibility |
|------|----------------|
| `apps/web/lib/user-wallet.ts` (modify) | add `ensureProvisionedAndFunded(userId)` (provision + fund-once), used everywhere |
| `apps/web/app/api/agent/run/route.ts` (modify) | use the shared helper instead of inline provision+fund |
| `apps/web/app/api/wallet/route.ts` (new) | GET → ensure funded → `{ eoaAddress, fundedMicroUsd, spentMicroUsd }` |
| `apps/web/app/api/egress/route.ts` (new) | POST → pay via user EOA through a node → record settlement → return result |
| `apps/web/lib/egress-session.ts` (new) | create/reuse a lightweight `sessions` row (no node registration) to scope the tape |
| `apps/web/components/FetchPanel.tsx` (new) | region+URL UI, calls `/api/egress`, shows result + egress IP/geo + balance + `SettlementLog` |
| `apps/web/components/MapRail.tsx` (modify) | render `FetchPanel` in the connected state instead of the traffic controls |
| `apps/web/app/map/page.tsx` (modify) | drop `useTrafficStream`; "Connect" just marks a node active for the panel |
| `apps/web/components/SettlementLog.tsx` | unchanged (still filters by `session_id`) |
| `.env.example` (modify) | document `SELLER_ADDRESS` is now also read by the web app |

The retired synthetic-traffic pieces (`lib/traffic.ts`, `app/api/browse/route.ts`, `Counter.tsx` usage) are left in place but unused; removal is a follow-up cleanup noted at the end.

---

## Task 1: Extract `ensureProvisionedAndFunded` (DRY)

**Files:**
- Modify: `apps/web/lib/user-wallet.ts`
- Modify: `apps/web/app/api/agent/run/route.ts`
- Test: `apps/web/test/ensure-funded.test.ts`

**Interfaces:**
- Consumes: `getOrCreateUserWallet`, `loadSigningKey`, `markFunded` (existing); `fundSponsored` from `@/lib/funding`.
- Produces: `ensureProvisionedAndFunded(userId: string): Promise<{ eoaAddress: \`0x${string}\`; fundedMicroUsd: number }>` — provisions the wallet if absent, funds it once if `fundedMicroUsd === 0`, returns the (now-funded) wallet.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/ensure-funded.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getOrCreateUserWallet = vi.fn();
const loadSigningKey = vi.fn(async () => "0xKEY");
const markFunded = vi.fn(async () => {});
const fundSponsored = vi.fn(async () => 500_000);

vi.mock("@/lib/funding", () => ({ fundSponsored }));
// Partial-mock our own module: keep ensureProvisionedAndFunded real, stub its deps.
vi.mock("@/lib/user-wallet", async (orig) => {
  const actual = await orig<typeof import("../lib/user-wallet")>();
  return { ...actual, getOrCreateUserWallet, loadSigningKey, markFunded };
});

import { ensureProvisionedAndFunded } from "../lib/user-wallet";

beforeEach(() => { vi.clearAllMocks(); });

describe("ensureProvisionedAndFunded", () => {
  it("funds a brand-new wallet once", async () => {
    getOrCreateUserWallet.mockResolvedValue({ userId: "0xu", eoaAddress: "0xeoa", fundedMicroUsd: 0 });
    const r = await ensureProvisionedAndFunded("0xu");
    expect(fundSponsored).toHaveBeenCalledWith("0xKEY");
    expect(markFunded).toHaveBeenCalledWith("0xu", 500_000);
    expect(r).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 });
  });
  it("does NOT re-fund an already-funded wallet", async () => {
    getOrCreateUserWallet.mockResolvedValue({ userId: "0xu", eoaAddress: "0xeoa", fundedMicroUsd: 500_000 });
    const r = await ensureProvisionedAndFunded("0xu");
    expect(fundSponsored).not.toHaveBeenCalled();
    expect(r).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- ensure-funded`
Expected: FAIL — `ensureProvisionedAndFunded` is not exported.

- [ ] **Step 3: Add the helper to `apps/web/lib/user-wallet.ts`**

Append (after `markFunded`), importing `fundSponsored` at the top (`import { fundSponsored } from "@/lib/funding";`):

```ts
/** Ensure the user has a provisioned + funded spending wallet. Funds once (when funded==0). */
export async function ensureProvisionedAndFunded(
  userId: string,
): Promise<{ eoaAddress: `0x${string}`; fundedMicroUsd: number }> {
  const wallet = await getOrCreateUserWallet(userId);
  if (wallet.fundedMicroUsd > 0) return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: wallet.fundedMicroUsd };
  const key = await loadSigningKey(userId);
  const granted = await fundSponsored(key);
  await markFunded(userId, granted);
  return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: granted };
}
```

- [ ] **Step 4: Use it in the agent route**

In `apps/web/app/api/agent/run/route.ts`, replace the inline block
```ts
    const wallet = await getOrCreateUserWallet(userId);
    if (wallet.fundedMicroUsd === 0) {
      const key = await loadSigningKey(userId);
      const granted = await fundSponsored(key);
      await markFunded(userId, granted);
    }
    const buyerPrivateKey = await loadSigningKey(userId);
```
with
```ts
    await ensureProvisionedAndFunded(userId);
    const buyerPrivateKey = await loadSigningKey(userId);
```
and update the imports: import `ensureProvisionedAndFunded`, `loadSigningKey` from `@/lib/user-wallet`; drop the now-unused `getOrCreateUserWallet`/`markFunded`/`fundSponsored` imports from the route.

- [ ] **Step 5: Run tests + the existing agent-route test**

Run: `pnpm --filter web test -- ensure-funded agent-run-route`
Expected: PASS (new helper tests + the existing route test still green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/user-wallet.ts apps/web/app/api/agent/run/route.ts apps/web/test/ensure-funded.test.ts
git commit -m "refactor(web): extract ensureProvisionedAndFunded; reuse in agent route"
```

---

## Task 2: `GET /api/wallet`

**Files:**
- Create: `apps/web/app/api/wallet/route.ts`
- Test: `apps/web/test/wallet-route.test.ts`

**Interfaces:**
- Consumes: `ensureProvisionedAndFunded` (Task 1); `supabaseService`; SIWE cookie.
- Produces: `GET /api/wallet` → `{ eoaAddress, fundedMicroUsd, spentMicroUsd }` (401 if not signed in). `spentMicroUsd` is summed from this user's `settlements` (payer = eoa).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/wallet-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ensureProvisionedAndFunded = vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 }));
vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded }));
const rows = [{ amount_micro_usd: 1000 }, { amount_micro_usd: 2000 }];
vi.mock("@/lib/supabase-server", () => ({
  supabaseService: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows }) }) }) }),
}));

import { GET } from "../app/api/wallet/route";
const req = (cookie?: string) =>
  new NextRequest("http://x/api/wallet", { headers: cookie ? { cookie } : {} });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/wallet", () => {
  it("401s when not signed in", async () => {
    expect((await GET(req())).status).toBe(401);
  });
  it("returns the funded wallet + summed spend", async () => {
    const res = await GET(req("siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 3000 });
    expect(ensureProvisionedAndFunded).toHaveBeenCalledWith("0xabc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- wallet-route`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/app/api/wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureProvisionedAndFunded } from "@/lib/user-wallet";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    const wallet = await ensureProvisionedAndFunded(userId);
    const { data } = await supabaseService()
      .from("settlements").select("amount_micro_usd").eq("payer", wallet.eoaAddress);
    const spentMicroUsd = (data ?? []).reduce((s: number, r: any) => s + Number(r.amount_micro_usd), 0);
    return NextResponse.json({ ...wallet, spentMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- wallet-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/wallet/route.ts apps/web/test/wallet-route.test.ts
git commit -m "feat(web): GET /api/wallet — user EOA, funded + spent balance"
```

---

## Task 3: `POST /api/egress` + lightweight session

**Files:**
- Create: `apps/web/lib/egress-session.ts`
- Create: `apps/web/app/api/egress/route.ts`
- Test: `apps/web/test/egress-route.test.ts`
- Modify: `.env.example` (note web reads `SELLER_ADDRESS`)

**Interfaces:**
- Consumes: `ensureProvisionedAndFunded`, `loadSigningKey`; `supabaseService`; `GatewayClient`; `ARC`.
- Produces:
  - `getOrCreateEgressSession(userId, nodeId, sessionId?): Promise<string>` — returns an existing owned active session id or inserts a new `sessions` row (no node registration) and returns its id.
  - `POST /api/egress` body `{ nodeId, url, sessionId? }` → `{ sessionId, status, bytes, egressIp, geo, transaction, amountMicroUsd }` (401 unauth, 400 bad input, 404 unknown node, 502 on egress/settle failure).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/egress-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ensureProvisionedAndFunded = vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 }));
const loadSigningKey = vi.fn(async () => "0xKEY");
vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded, loadSigningKey }));
vi.mock("@/lib/egress-session", () => ({ getOrCreateEgressSession: vi.fn(async () => "sess-1") }));

const pay = vi.fn(async () => ({ data: { status: 200, bytes: 42, egressIp: "1.2.3.4" }, amount: 1000n, transaction: "uuid-1", status: 200 }));
vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: vi.fn().mockImplementation(() => ({ pay })) }));

const insert = vi.fn(async () => ({ error: null }));
const nodeRow = { id: "tokyo-1", proxy_url: "https://node", country: "Japan", city: "Tokyo", lat: 35, lng: 139 };
vi.mock("@/lib/supabase-server", () => ({
  supabaseService: () => ({
    from: (t: string) => t === "nodes"
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: nodeRow }) }) }) }
      : { insert },
  }),
}));

import { POST } from "../app/api/egress/route";
const req = (body: any, cookie?: string) =>
  new NextRequest("http://x/api/egress", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/egress", () => {
  it("401s when not signed in", async () => {
    expect((await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }))).status).toBe(401);
  });
  it("400s on missing url/nodeId", async () => {
    expect((await POST(req({ nodeId: "tokyo-1" }, "siwe-address=0xABC"))).status).toBe(400);
  });
  it("pays via the user's EOA, records a settlement, returns the result", async () => {
    const res = await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }, "siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4",
      geo: { country: "Japan", city: "Tokyo" }, transaction: "uuid-1", amountMicroUsd: 1000,
    });
    expect(pay).toHaveBeenCalledWith("https://node/egress?url=https%3A%2F%2Fex.com", { method: "POST" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "sess-1", settlement_uuid: "uuid-1", amount_micro_usd: 1000, payer: "0xeoa", network: "eip155:5042002", status: "received",
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- egress-route`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the session helper**

```ts
// apps/web/lib/egress-session.ts
import "server-only";
import { supabaseService } from "@/lib/supabase-server";

/** A scoping row for the human fetch tape. No node registration (we use /egress, not the CONNECT proxy). */
export async function getOrCreateEgressSession(userId: string, nodeId: string, sessionId?: string): Promise<string> {
  const db = supabaseService();
  if (sessionId) {
    const { data } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_address", userId).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await db.from("sessions")
    .insert({ user_address: userId, node_id: nodeId, status: "active", budget_micro_usd: 0 })
    .select("id").single();
  if (error || !data) throw new Error(`session create failed: ${error?.message}`);
  return data.id;
}
```

- [ ] **Step 4: Implement the route**

```ts
// apps/web/app/api/egress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC } from "@nanovpn/core";
import { ensureProvisionedAndFunded, loadSigningKey } from "@/lib/user-wallet";
import { getOrCreateEgressSession } from "@/lib/egress-session";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";
const SELLER = process.env.SELLER_ADDRESS ?? null;

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const nodeId = String(body?.nodeId ?? "");
  const url = String(body?.url ?? "").trim();
  if (!nodeId || !url) return NextResponse.json({ error: "nodeId and url are required" }, { status: 400 });

  const db = supabaseService();
  const { data: node } = await db.from("nodes").select("id,proxy_url,country,city,lat,lng,operator_address").eq("id", nodeId).single();
  if (!node) return NextResponse.json({ error: "unknown node" }, { status: 404 });

  try {
    await ensureProvisionedAndFunded(userId);
    const key = await loadSigningKey(userId);
    const eoa = (await import("viem/accounts")).privateKeyToAccount(key).address;
    const sessionId = await getOrCreateEgressSession(userId, nodeId, body?.sessionId);

    const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: key });
    const res = await buyer.pay<{ status: number; bytes: number; egressIp: string }>(
      `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`, { method: "POST" },
    );

    await db.from("settlements").insert({
      session_id: sessionId, settlement_uuid: res.transaction, amount_micro_usd: Number(res.amount),
      payer: eoa, payee: SELLER ?? node.operator_address, network: ARC.network, status: "received",
    });

    return NextResponse.json({
      sessionId, status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp,
      geo: { country: node.country, city: node.city, lat: node.lat, lng: node.lng },
      transaction: res.transaction, amountMicroUsd: Number(res.amount),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
```

- [ ] **Step 5: Document the env var**

In `.env.example`, under the "Onboarding pilot" section add:
```bash
# SELLER_ADDRESS is also read by the web app (it records human-fetch settlements). Same value as the edge-node's.
```
(Operationally: add `SELLER_ADDRESS` to `apps/web/.env.local` and to Vercel Production — covered in Manual verification.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter web test -- egress-route`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/egress-session.ts apps/web/app/api/egress/route.ts apps/web/test/egress-route.test.ts .env.example
git commit -m "feat(web): POST /api/egress — authed per-user real fetch through a node + settlement"
```

---

## Task 4: `FetchPanel` component

**Files:**
- Create: `apps/web/components/FetchPanel.tsx`
- Modify: `apps/web/app/globals.css` (panel styles)
- Test: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/wallet`, `POST /api/egress`; existing `SettlementLog` (by `session_id`); `formatUsd` from `./format`.
- Produces: `FetchPanel({ node }: { node: NodeListing })` — a client component with a URL input (presets), a "Fetch through {city}" button, a result readout (status/bytes/egressIp + the node's geo), a balance line, and the `SettlementLog` once a session exists.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/fetch-panel.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerRequestUsd: 0.001 } as any;

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 0 }), { status: 200 });
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4", geo: node.geo, transaction: "uuid-1", amountMicroUsd: 1000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

describe("FetchPanel", () => {
  it("shows balance, fetches through the node, and renders the result + tape", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getByText(/0\.50/)).toBeTruthy()); // funded balance
    fireEvent.click(screen.getByRole("button", { name: /Fetch through Tokyo/i }));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy()); // egress IP in result
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();                    // SettlementLog wired with the session
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- fetch-panel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/components/FetchPanel.tsx
"use client";
import { useEffect, useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";

const PRESETS = [
  "https://api.ipify.org?format=json",
  "https://ipinfo.io/json",
  "https://httpbin.org/headers",
];

type Result = { status: number; bytes: number; egressIp: string; geo: { country: string; city: string }; amountMicroUsd: number };

export function FetchPanel({ node }: { node: NodeListing }) {
  const [balance, setBalance] = useState<{ fundedMicroUsd: number; spentMicroUsd: number } | null>(null);
  const [url, setUrl] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).then((d) => d && setBalance(d)).catch(() => {});
  }, []);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/egress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: node.id, url, sessionId }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "fetch failed"); return; }
      setSessionId(d.sessionId);
      setResult(d);
      setBalance((b) => (b ? { ...b, spentMicroUsd: b.spentMicroUsd + d.amountMicroUsd } : b));
    } finally { setBusy(false); }
  }

  const remaining = balance ? balance.fundedMicroUsd - balance.spentMicroUsd : 0;
  return (
    <div className="fetchpanel">
      {balance && (
        <p className="fetchpanel__bal">Balance {formatUsd(remaining)} <span className="hint">of {formatUsd(balance.fundedMicroUsd)} granted</span></p>
      )}
      <div className="fetchpanel__row">
        <select className="fetchpanel__url" value={url} onChange={(e) => setUrl(e.target.value)}>
          {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn btn--primary" disabled={busy} onClick={go}>
          {busy ? "Fetching…" : `Fetch through ${node.geo.city}`}
        </button>
      </div>
      {err && <p className="hint" style={{ color: "var(--amber)" }}>{err}</p>}
      {result && (
        <div className="fetchpanel__result">
          <p>HTTP {result.status} · {result.bytes} B · {formatUsd(result.amountMicroUsd)}</p>
          <p>egress <strong>{result.egressIp}</strong> — {result.geo.city}, {result.geo.country}</p>
        </div>
      )}
      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
```

- [ ] **Step 4: Add minimal styles**

In `apps/web/app/globals.css` append:
```css
.fetchpanel { display: flex; flex-direction: column; gap: 8px; }
.fetchpanel__row { display: flex; gap: 8px; }
.fetchpanel__url { flex: 1; min-width: 0; }
.fetchpanel__bal { color: var(--ink); font-weight: 600; }
.fetchpanel__result { background: var(--green-tint); color: var(--ink); border-radius: 8px; padding: 8px 10px; overflow-wrap: anywhere; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- fetch-panel`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/app/globals.css apps/web/test/fetch-panel.test.tsx
git commit -m "feat(web): FetchPanel — route a real request through a node, show egress IP/geo + settlement"
```

---

## Task 5: Wire `FetchPanel` into the map (retire synthetic traffic)

**Files:**
- Modify: `apps/web/components/MapRail.tsx`
- Modify: `apps/web/app/map/page.tsx`
- Test: `apps/web/test/map-rail.test.tsx` (extend)

**Interfaces:**
- Consumes: `FetchPanel` (Task 4).
- Produces: connected `/map` shows the `FetchPanel` for the selected node instead of the Start-traffic controls; `useTrafficStream` is removed from the page.

- [ ] **Step 1: Write the failing test (extend MapRail suite)**

Add to `apps/web/test/map-rail.test.tsx`:

```tsx
it("renders the FetchPanel (Fetch through …) when connected", () => {
  const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerRequestUsd: 0.001 } as any;
  render(
    <MapRail node={node} signedIn={"0xabc"} session={{ sessionId: "s1" }} connecting={false}
      streaming={false} intensity={"medium"} copilotMsg={null}
      onConnect={() => {}} onDisconnect={() => {}} onToggleStream={() => {}} onIntensity={() => {}} onCopilot={() => {}} />,
  );
  expect(screen.getByRole("button", { name: /Fetch through Tokyo/i })).toBeTruthy();
});
```
(If `FetchPanel`'s `useEffect` fetch errors in jsdom, stub it: `vi.mock("../components/FetchPanel", () => ({ FetchPanel: ({ node }: any) => <button>Fetch through {node.geo.city}</button> }));` at the top of the file — the panel itself is covered by Task 4.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- map-rail`
Expected: FAIL — the connected rail still renders the traffic controls, not the panel.

- [ ] **Step 3: Render `FetchPanel` in the connected state**

In `apps/web/components/MapRail.tsx`, import `FetchPanel` and, in the connected branch (where `session && node` currently renders `Counter` + Start-traffic + intensity), replace the `Counter`/traffic-button/intensity block with:

```tsx
        <FetchPanel node={node} />
```
Keep the "Disconnect" button. Leave the `onToggleStream`/`onIntensity`/`streaming`/`intensity` props in the type for now (unused) to avoid touching the page's prop wiring in this task.

- [ ] **Step 4: Drop the synthetic traffic loop from the page**

In `apps/web/app/map/page.tsx`, remove the line `useTrafficStream(session?.sessionId ?? null, intensity, streaming);` and its import. Leave the `streaming`/`intensity` state (still passed to `WorldMap` for the connection-line animation and to `MapRail` props) — do not remove those in this task.

- [ ] **Step 5: Run tests + build**

Run: `pnpm --filter web test -- map-rail fetch-panel` then `pnpm -r build`
Expected: tests PASS; build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/MapRail.tsx apps/web/app/map/page.tsx apps/web/test/map-rail.test.tsx
git commit -m "feat(web): show FetchPanel on connect; retire synthetic traffic loop"
```

---

## Manual verification (after all tasks)

Same headless technique as Plan 1 (no browser needed), run against the deployed site or local dev:
1. Ensure `SELLER_ADDRESS` is set in `apps/web/.env.local` AND Vercel Production (same value as the edge-node — `0xbAd0E18452f7F5F1F4F1fd8E6bCc24A28a5B94dC`).
2. Sign in (SIWE), `GET /api/wallet` → returns your EOA + `fundedMicroUsd` 500000.
3. `POST /api/egress {nodeId, url:"https://api.ipify.org?format=json"}` → 200 with `egressIp` = the Fly node's IP, and a `settlements` row appears with `payer` = your EOA.
4. Confirm the facilitator transfer (`/v1/x402/transfers/<uuid>`) `fromAddress` = your EOA (not the shared wallet) — same proof as Plan 1, now for the human path.

## Out of scope (follow-ups)

- **Plan 2b — MetaMask self-funding:** connect MetaMask (wagmi/`injected` is already wired in `lib/wagmi.ts`) → user transfers USDC to their spending EOA → server triggers the EOA's Gateway deposit → `funding_source = 'metamask'`; leftover refund. Browser-wallet flow, separate plan.
- **Plan 3 — real geo regions:** until then the egress IP is the single Fly node regardless of the node picked; the panel shows the node's *declared* geo. The compare-regions side-by-side ("Japan vs Germany") lands with Plan 3.
- **Cleanup:** remove the now-unused `lib/traffic.ts`, `app/api/browse/route.ts`, and the `Counter` usage / `streaming`+`intensity` plumbing once the panel is confirmed; the edge-node CONNECT proxy + `/usage` SSE can be retired too.
- **Carried Plan-1 follow-ups still open:** signup rate-limit + I1 double-fund race (now also reachable via `/api/egress` first-fetch funding).

## Self-review notes (addressed)

- **Spec coverage (Plan-2 slice):** interactive real-fetch through a chosen node, showing egress IP/geo + per-fetch on-chain settlement from the user's own wallet, replacing synthetic traffic (Tasks 2–5); DRY reuse of Plan 1 funding (Task 1). MetaMask funding + real geo are explicitly deferred, not gaps.
- **Type consistency:** `ensureProvisionedAndFunded` (Task 1) is consumed by Tasks 2–3; `/api/egress` returns `{ sessionId, status, bytes, egressIp, geo, transaction, amountMicroUsd }` consumed by `FetchPanel` (Task 4); `getOrCreateEgressSession` signature matches its caller.
- **No placeholders:** every step has real code/commands. `SELLER_ADDRESS` web env is an operational step (Manual verification), not a code TBD; `payee` falls back to `node.operator_address` if `SELLER_ADDRESS` is unset so the insert never writes null.
