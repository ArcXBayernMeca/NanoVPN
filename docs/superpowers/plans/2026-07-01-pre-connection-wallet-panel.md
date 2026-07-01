# Pre-connection Wallet Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a wallet panel (MetaMask USDC balance + Gateway spending balance + Fund) on `/map` as soon as the user is signed in, before connecting to a node.

**Architecture:** Extract a new `WalletPanel` component that owns the balance display + self-fund (moved out of the connected-only `FetchPanel`). `MapRail` renders it whenever `signedIn`; `FetchPanel` slims to just the streaming instrument.

**Tech Stack:** Next.js App Router (client components), wagmi (Arc testnet), viem, vitest + @testing-library/react. Web-only; no route/DB changes.

## Global Constraints

- **USDC is 6 decimals** — the wallet balance read/display uses the ERC-20 6-dec `balanceOf` (never the 18-dec native, which is gas-only on Arc).
- **Pin the wallet read to Arc:** `useReadContract({ …, chainId: ARC.chainId, query: { enabled: !!address } })`; show **"—"** when unreadable / wrong network / no address (never a misleading `0`).
- **Sufficient-balance guard on Fund:** block the transfer when `parseUnits(amount, 6)` exceeds the shown wallet balance, with an inline "Not enough USDC in your wallet".
- **Gateway balance never fabricated:** show **"syncing…"** when `gatewayMicroUsd == null`.
- **No route or DB changes** (`/api/wallet` and `/api/self-fund` already return what's needed).
- **Keep the existing web suite green.**

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/web/components/WalletPanel.tsx` | Wallet + Spending balances + Fund (moved from FetchPanel) | Create |
| `apps/web/test/walletpanel.test.tsx` | balances / syncing / fund / guards | Create |
| `apps/web/app/globals.css` | `.walletpanel` wrapper (reuses existing `.streampanel__*` fund/balance rules) | Modify |
| `apps/web/components/FetchPanel.tsx` | drop balance + fund + wallet/wagmi funding code | Modify |
| `apps/web/test/fetch-panel.test.tsx` | drop fund/zero/balance/syncing tests; keep streaming | Modify |
| `apps/web/components/MapRail.tsx` | render `<WalletPanel/>` when `signedIn` | Modify |
| `apps/web/test/map-rail.test.tsx` | WalletPanel shown when signedIn | Modify |

---

## Task 1: `WalletPanel` component

**Files:**
- Create: `apps/web/components/WalletPanel.tsx`
- Create: `apps/web/test/walletpanel.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `WalletPanel()` — a no-prop client component. Reads the connected MetaMask address's Arc USDC via wagmi `useReadContract`, fetches `/api/wallet` for the Gateway balance, and reuses the self-fund flow (`transfer` → `/api/self-fund` → refetch). Consumed by Task 3 (MapRail).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/walletpanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WalletPanel } from "../components/WalletPanel";

const writeContractAsync = vi.fn(async () => "0xhash");
const waitForTransactionReceipt = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0xmeta" }),
  useReadContract: () => ({ data: 10_000_000n }), // 10 USDC in the MetaMask wallet
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: 500_000 }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 2_000_000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

describe("WalletPanel", () => {
  it("shows the MetaMask wallet balance and the Gateway spending balance", async () => {
    render(<WalletPanel />);
    expect(screen.getByText(/\$10\.00/)).toBeTruthy();                       // wallet: 10_000_000 µUSD
    await waitFor(() => expect(screen.getByText(/\$0\.50/)).toBeTruthy());    // spending: 500_000 µUSD
  });

  it("shows 'syncing…' when the gateway balance is unavailable", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: null }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByText(/syncing/i)).toBeTruthy());
  });

  it("funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] });
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/self-fund"))).toBe(true));
  });

  it("zero-amount guard: no transfer, shows an error", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.change(document.querySelector(".streampanel__amt") as HTMLInputElement, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    expect(writeContractAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Enter an amount greater than 0/i)).toBeTruthy());
  });

  it("insufficient-balance guard: amount over the wallet balance blocks the transfer", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.change(document.querySelector(".streampanel__amt") as HTMLInputElement, { target: { value: "20" } }); // > 10 USDC wallet
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    expect(writeContractAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Not enough USDC/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test walletpanel`
Expected: FAIL — cannot resolve `../components/WalletPanel`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/WalletPanel.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";

type Wallet = { eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string; gatewayMicroUsd: number | null };
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // MetaMask wallet's Arc USDC (6-dec ERC-20). Pinned to Arc so a wrong-network wallet reads "—".
  const { data: walletBal } = useReadContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: ARC.chainId,
    query: { enabled: !!address },
  });

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function refresh() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setWallet(d);
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000); // keep the spending balance honest as streaming drains it
    return () => clearInterval(id);
  }, []);

  async function fund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!wallet || !publicClient) return;
    const wei = parseUnits(amount, ARC.usdcDecimals);
    if (walletBal != null && wei > (walletBal as bigint)) { setFundErr("Not enough USDC in your wallet"); return; }
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [wallet.eoaAddress as `0x${string}`, wei],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const r = await fetch("/api/self-fund", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setFundErr(d.error ?? "self-fund failed"); return; }
      await refresh();
    } catch (e) { setFundErr((e as Error).message); } finally { setFunding(false); }
  }

  return (
    <div className="walletpanel">
      <p className="streampanel__bal">Wallet{" "}
        {walletBal != null
          ? <><strong>{formatUsd(Number(walletBal))}</strong> <span className="streampanel__sub">{short(address)}</span></>
          : <span className="streampanel__sub">—</span>}
      </p>
      {wallet && (
        <p className="streampanel__bal">Spending balance{" "}
          {wallet.gatewayMicroUsd == null
            ? <span className="streampanel__sub">syncing…</span>
            : <><strong>{formatUsd(wallet.gatewayMicroUsd)}</strong> <span className="streampanel__sub">of {formatUsd(wallet.fundedMicroUsd)} funded</span></>}
        </p>
      )}
      <div className="streampanel__fund">
        <span className="streampanel__sub">Top up your spending wallet (USDC)</span>
        <div className="streampanel__fundrow">
          <div className="streampanel__amtwrap">
            <span className="streampanel__amtcur">$</span>
            <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top up amount" />
          </div>
          <button className="btn btn--secondary streampanel__fundbtn" disabled={funding || !isConnected || !wallet} onClick={fund}>
            {funding ? "Funding…" : "Fund"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>
    </div>
  );
}
```

Add to `apps/web/app/globals.css` (next to the `.streampanel__bal` rules — the fund/balance `.streampanel__*` rules are reused as-is):

```css
.walletpanel { display: flex; flex-direction: column; gap: 10px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test walletpanel`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/WalletPanel.tsx apps/web/test/walletpanel.test.tsx apps/web/app/globals.css
git commit -m "feat(web): WalletPanel — wallet + spending balances + fund (with sufficient-balance guard)"
```

---

## Task 2: Slim `FetchPanel` to the streaming instrument

**Files:**
- Modify: `apps/web/components/FetchPanel.tsx`
- Test: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Produces: `FetchPanel` unchanged props (`{ node, streaming, intensity, onToggleStream, onIntensity }`); it no longer renders a Balance line or Fund button, and no longer calls `/api/wallet` or uses wagmi.

- [ ] **Step 1: Update the test (failing)**

Replace `apps/web/test/fetch-panel.test.tsx` with (drops the wagmi mock, the `/api/wallet` + `/api/self-fund` mocks, and the fund/zero-amount/balance/syncing tests; fixes the off-state test to not rely on an `/api/wallet` mount call):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerGbUsd: 2.5 } as any;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "1.2.3.4", geo: { city: "London", country: "United Kingdom" }, region: "nrt", regionVerified: true, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

const noop = () => {};

describe("FetchPanel streaming", () => {
  it("streams when `streaming` is on: ticks /api/egress and accumulates the counter + egress + tape", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/0\.26 MB/)).toBeTruthy());
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();
  });

  it("does not stream when `streaming` is off", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    expect(screen.getByText(/STREAMING SPEND/)).toBeTruthy(); // mounted
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(false);
  });

  it("shows the ✓ verified badge when the egress tick is region-verified", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeTruthy());
  });

  it("shows the actual region honestly (no ✓) when a tick is not region-verified", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "9.9.9.9", geo: { city: "Tokyo", country: "Japan" }, region: "lhr", regionVerified: false, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/London/)).toBeTruthy());
    expect(screen.queryByText(/verified/i)).toBeNull();
  });

  it("no longer renders a Balance line or Fund button (moved to WalletPanel)", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    expect(screen.queryByRole("button", { name: "Fund" })).toBeNull();
    expect(screen.queryByText(/of \$.* funded/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test fetch-panel`
Expected: FAIL — FetchPanel still renders the Fund button + Balance line (the new "no longer renders" test fails), and the off-state test may still see a stray call.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/components/FetchPanel.tsx` with (streaming instrument only — balance/fund/wallet/wagmi removed):

```tsx
"use client";
import { useEffect, useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { FLY_REGION_CITY } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementLog } from "./SettlementLog";
import { intervalForIntensity, type Intensity } from "@/lib/traffic";

export function FetchPanel({ node, streaming, intensity, onToggleStream, onIntensity }: {
  node: NodeListing; streaming: boolean; intensity: Intensity;
  onToggleStream(): void; onIntensity(i: Intensity): void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bytesUsed, setBytesUsed] = useState(0);
  const [streamSpent, setStreamSpent] = useState(0);
  const [egress, setEgress] = useState<{ ip: string; geo: { city: string; country: string }; verified: boolean; region: string | null } | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);

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
        setEgress({ ip: d.egressIp, geo: d.geo, verified: !!d.regionVerified, region: d.region ?? null });
      } catch { /* aborted / soft-fail */ } finally { inFlight = false; }
    };
    void tick();
    const id = setInterval(() => void tick(), intervalForIntensity(intensity));
    return () => { ctrl.abort(); clearInterval(id); };
  }, [streaming, intensity, sessionId, node.id]);

  const RATES: Intensity[] = ["light", "medium", "heavy"];
  return (
    <div className="streampanel">
      <div className="streampanel__counter">
        <div className="streampanel__spend">{formatUsd(streamSpent)}</div>
        <div className="streampanel__label">STREAMING SPEND</div>
        <div className="streampanel__data">{(bytesUsed / 1_000_000).toFixed(2)} MB used</div>
      </div>
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

      <button className="btn btn--primary streampanel__toggle" onClick={onToggleStream}>
        {streaming ? "Stop streaming" : "Start streaming"}
      </button>
      <div className="streampanel__rates">
        {RATES.map((i) => (
          <button key={i} className={`btn btn--ghost ${intensity === i ? "is-active" : ""}`} onClick={() => onIntensity(i)}>{i}</button>
        ))}
      </div>
      {streamErr && <p className="streampanel__warn">⚠ {streamErr}</p>}

      {sessionId && <SettlementLog sessionId={sessionId} />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test fetch-panel`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/test/fetch-panel.test.tsx
git commit -m "refactor(web): slim FetchPanel to the streaming instrument (balance+fund moved to WalletPanel)"
```

---

## Task 3: Render `WalletPanel` in `MapRail` when signed in

**Files:**
- Modify: `apps/web/components/MapRail.tsx`
- Test: `apps/web/test/map-rail.test.tsx`

**Interfaces:**
- Consumes: `WalletPanel` (Task 1). Uses the existing `signedIn` prop.

- [ ] **Step 1: Update the test (failing)**

In `apps/web/test/map-rail.test.tsx`, add a `WalletPanel` mock next to the existing `FetchPanel` mock (top of file):

```tsx
vi.mock("@/components/WalletPanel", () => ({ WalletPanel: () => <div>wallet-panel</div> }));
```

And add a describe block:

```tsx
describe("MapRail wallet panel", () => {
  it("renders the WalletPanel when signed in (before connecting)", () => {
    render(<MapRail {...base} />); // base.signedIn = "0xabc", session = null
    expect(screen.getByText("wallet-panel")).toBeTruthy();
  });
  it("does not render the WalletPanel when not signed in", () => {
    render(<MapRail {...base} signedIn={null} />);
    expect(screen.queryByText("wallet-panel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test map-rail`
Expected: FAIL — no "wallet-panel" text (MapRail doesn't render WalletPanel yet).

- [ ] **Step 3: Write the implementation**

In `apps/web/components/MapRail.tsx`:

(a) Add the import next to the `FetchPanel` import (line 4):

```tsx
import { WalletPanel } from "./WalletPanel";
```

(b) Add a WalletPanel section immediately after the closing `</section>` of the exit-node section (currently line 48, before the `{session && node && (` block):

```tsx
      {signedIn && (
        <section className="maprail__sec">
          <WalletPanel />
        </section>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test map-rail`
Expected: PASS.

- [ ] **Step 5: Full web suite + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: all web tests pass; Next build clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/MapRail.tsx apps/web/test/map-rail.test.tsx
git commit -m "feat(web): show WalletPanel in the rail as soon as you're signed in"
```

---

## Deployment (after all tasks + review)

Web-only. `vercel deploy --prod` from repo root. **Live check (Martin):** sign in on `/map` → the Wallet + Spending balance show immediately (before picking a node); Fund works pre-connection; connecting still shows the streaming panel below the balances.

---

## Self-Review

**1. Spec coverage:**
- New WalletPanel with Wallet + Spending balances + Fund (§A) → Task 1 ✓
- Chain-pinned wallet read + "—" fallback (§A / audit) → Task 1 (`chainId`, `query.enabled`, `walletBal != null`) ✓
- Sufficient-balance guard (§A / audit) → Task 1 (guard + test) ✓
- 15s poll + refetch on mount/after-fund (§A) → Task 1 ✓
- MapRail renders it when `signedIn` (§B) → Task 3 ✓
- FetchPanel drops balance/fund/wagmi, keeps streaming (§C) → Task 2 ✓
- Tests moved from fetch-panel → walletpanel (§Testing) → Tasks 1 & 2 ✓
- No route/DB changes, web-only → Global Constraints + Deployment ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete; the CSS reuse (existing `.streampanel__*` fund rules) is stated explicitly.

**3. Type consistency:** `WalletPanel()` no-prop (Task 1) is imported + rendered in Task 3. The `Wallet` shape (`gatewayMicroUsd: number | null`, `eoaAddress`, `fundedMicroUsd`) matches `/api/wallet`'s response. `formatUsd` takes µUSD in all call sites (wallet balance passes `Number(walletBal)` — a 6-dec USDC atomic = µUSD). `ARC.usdc` / `ARC.chainId` / `ARC.usdcDecimals` exist in `packages/core/src/chain.ts`. The `.streampanel__amt` selector the tests query is unchanged (reused by WalletPanel).
