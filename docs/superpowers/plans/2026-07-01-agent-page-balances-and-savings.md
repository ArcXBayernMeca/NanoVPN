# Agent Page: Wallet Balances + Savings Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/agent`, show the wallet + Gateway balances (top, with Fund; and compactly in the rail) and a per-location "money saved vs a residential proxy" benchmark in the rail.

**Architecture:** Extract a `useWalletBalances` hook from `WalletPanel`; reuse the full `WalletPanel` at the top and a compact `WalletBalances` in the rail. Add a pure `residentialSavings` helper + a realtime `useAgentBytes` hook, feeding a `SavingsBenchmark` in the rail.

**Tech Stack:** Next.js App Router (client components), wagmi/viem, Supabase realtime, vitest + @testing-library/react, `@nanovpn/core`. Web-only; no route/DB changes.

## Global Constraints

- **USDC 6-dec / µUSD everywhere.** All money values are µUSD (6-dec atomic); `formatUsd` divides by 1e6. Wallet balance is the 6-dec ERC-20 `balanceOf` (never 18-dec native).
- **`RESIDENTIAL_MARKUP = 5`** (constant). `reference $/GB = chosen node's pricePerGbUsd × RESIDENTIAL_MARKUP`.
- **Savings is an ESTIMATE, never a quoted vendor price** — the `SavingsBenchmark` UI must carry an "est."/estimate marker whenever it shows a reference, and state the markup assumption.
- **Never show fabricated/negative savings:** neutral display when `reference ≤ paid`; "no savings yet" when `bytes = 0` or no node chosen.
- **No route/DB changes** (bytes summed from existing `agent_events`; balances from `/api/wallet`).
- **Keep the existing web + core suites green.**

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `packages/core/src/pricing.ts` | `residentialSavings` + `RESIDENTIAL_MARKUP` | Modify |
| `packages/core/test/pricing.test.ts` | savings math tests | Modify |
| `apps/web/lib/use-wallet-balances.ts` | wallet + gateway balances hook | Create |
| `apps/web/components/WalletPanel.tsx` | consume the hook | Modify |
| `apps/web/components/WalletBalances.tsx` | compact read-only balances | Create |
| `apps/web/lib/use-agent-bytes.ts` | realtime total-bytes hook | Create |
| `apps/web/components/SavingsBenchmark.tsx` | savings UI (estimate-labeled) | Create |
| `apps/web/components/AgentStatusRail.tsx` | wire WalletBalances + SavingsBenchmark | Modify |
| `apps/web/components/AgentWalletPanel.tsx` | sign-in-gated WalletPanel wrapper | Create |
| `apps/web/app/agent/page.tsx` | render AgentWalletPanel near the form | Modify |
| `apps/web/app/globals.css` | `.walletbalances` + `.savings` rules | Modify |
| `apps/web/test/*` | new component/helper tests | Create/Modify |

---

## Task 1: core — `residentialSavings` + `RESIDENTIAL_MARKUP`

**Files:**
- Modify: `packages/core/src/pricing.ts`
- Test: `packages/core/test/pricing.test.ts`

**Interfaces:**
- Produces: `RESIDENTIAL_MARKUP: number` (=5) and `residentialSavings(bytes: number, paidMicroUsd: number, refUsdPerGb: number): { referenceMicroUsd: number; savedMicroUsd: number; pct: number }`. Consumed by Task 5 (SavingsBenchmark) and Task 6 (rail derives `refUsdPerGb`).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/pricing.test.ts`:

```ts
import { residentialSavings, RESIDENTIAL_MARKUP } from "../src/pricing";

describe("residentialSavings", () => {
  it("RESIDENTIAL_MARKUP is 5", () => {
    expect(RESIDENTIAL_MARKUP).toBe(5);
  });
  it("computes savings for a 1 MB fetch at $15/GB vs $0.001 paid", () => {
    const s = residentialSavings(1_000_000, 1000, 15); // reference = round(1e6*15/1000) = 15000 µUSD
    expect(s.referenceMicroUsd).toBe(15000);
    expect(s.savedMicroUsd).toBe(14000);
    expect(s.pct).toBe(93); // round(14000/15000*100)
  });
  it("returns zeros when there are no bytes", () => {
    expect(residentialSavings(0, 1000, 15)).toEqual({ referenceMicroUsd: 0, savedMicroUsd: 0, pct: 0 });
  });
  it("reports negative savings when the reference is below what was paid (caller clamps)", () => {
    const s = residentialSavings(500, 1000, 15); // reference = round(500*15/1000) = 8 µUSD
    expect(s.referenceMicroUsd).toBe(8);
    expect(s.savedMicroUsd).toBe(-992);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/core test pricing`
Expected: FAIL — `residentialSavings`/`RESIDENTIAL_MARKUP` not exported.

- [ ] **Step 3: Write the implementation**

Append to `packages/core/src/pricing.ts` (after `microUsdForBytes`):

```ts
// Illustrative markup: a residential proxy runs ~this many times a metered geo rate. Used ONLY to
// estimate "what you'd pay without NanoVPN" for the savings benchmark — never a quoted vendor price.
export const RESIDENTIAL_MARKUP = 5;

/**
 * Estimated savings vs a residential proxy, all in µUSD:
 *   reference = the fetched bytes priced at refUsdPerGb; saved = reference − what was paid.
 * `savedMicroUsd` may be negative (tiny fetches); the caller decides how to present it.
 */
export function residentialSavings(bytes: number, paidMicroUsd: number, refUsdPerGb: number): { referenceMicroUsd: number; savedMicroUsd: number; pct: number } {
  if (bytes <= 0) return { referenceMicroUsd: 0, savedMicroUsd: 0, pct: 0 };
  const referenceMicroUsd = microUsdForBytes(bytes, refUsdPerGb);
  const savedMicroUsd = referenceMicroUsd - paidMicroUsd;
  const pct = referenceMicroUsd > 0 ? Math.round((savedMicroUsd / referenceMicroUsd) * 100) : 0;
  return { referenceMicroUsd, savedMicroUsd, pct };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nanovpn/core test pricing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pricing.ts packages/core/test/pricing.test.ts
git commit -m "feat(core): residentialSavings + RESIDENTIAL_MARKUP for the savings benchmark"
```

---

## Task 2: `useWalletBalances` hook + refactor `WalletPanel`

**Files:**
- Create: `apps/web/lib/use-wallet-balances.ts`
- Modify: `apps/web/components/WalletPanel.tsx`
- Test: (none new) `apps/web/test/walletpanel.test.tsx` is the regression guard

**Interfaces:**
- Produces: `useWalletBalances(): { walletMicroUsd: number | null; gatewayMicroUsd: number | null; fundedMicroUsd: number | null; eoaAddress: string | null; address: `0x${string}` | undefined; refresh: () => Promise<void> }`. Consumed by Task 3 (WalletBalances) and the refactored WalletPanel.

- [ ] **Step 1: Create the hook**

Create `apps/web/lib/use-wallet-balances.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";

type ApiWallet = { eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string; gatewayMicroUsd: number | null };
export interface WalletBalances {
  walletMicroUsd: number | null;
  gatewayMicroUsd: number | null;
  fundedMicroUsd: number | null;
  eoaAddress: string | null;
  address: `0x${string}` | undefined;
  refresh: () => Promise<void>;
}

/** MetaMask USDC (6-dec ERC-20, Arc-pinned) + /api/wallet (gateway/funded/eoa) on mount + a 15s poll. */
export function useWalletBalances(): WalletBalances {
  const { address } = useAccount();
  const { data: walletBal } = useReadContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: ARC.chainId,
    query: { enabled: !!address },
  });
  const [wallet, setWallet] = useState<ApiWallet | null>(null);

  async function refresh() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setWallet(d);
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  return {
    walletMicroUsd: walletBal != null ? Number(walletBal) : null,
    gatewayMicroUsd: wallet ? wallet.gatewayMicroUsd : null,
    fundedMicroUsd: wallet ? wallet.fundedMicroUsd : null,
    eoaAddress: wallet ? wallet.eoaAddress : null,
    address,
    refresh,
  };
}
```

- [ ] **Step 2: Refactor WalletPanel to consume it**

Replace `apps/web/components/WalletPanel.tsx` with:

```tsx
"use client";
import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function WalletPanel() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { walletMicroUsd, gatewayMicroUsd, fundedMicroUsd, eoaAddress, address, refresh } = useWalletBalances();

  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function fund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!eoaAddress || !publicClient) return;
    const wei = parseUnits(amount, ARC.usdcDecimals);
    if (walletMicroUsd != null && wei > BigInt(walletMicroUsd)) { setFundErr("Not enough USDC in your wallet"); return; }
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [eoaAddress as `0x${string}`, wei],
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
        {walletMicroUsd != null
          ? <><strong>{formatUsd(walletMicroUsd)}</strong> <span className="streampanel__sub">{short(address)}</span></>
          : <span className="streampanel__sub">—</span>}
      </p>
      {eoaAddress != null && (
        <p className="streampanel__bal">Spending balance{" "}
          {gatewayMicroUsd == null
            ? <span className="streampanel__sub">syncing…</span>
            : <><strong>{formatUsd(gatewayMicroUsd)}</strong> <span className="streampanel__sub">of {formatUsd(fundedMicroUsd ?? 0)} funded</span></>}
        </p>
      )}
      <div className="streampanel__fund">
        <span className="streampanel__sub">Top up your spending wallet (USDC)</span>
        <div className="streampanel__fundrow">
          <div className="streampanel__amtwrap">
            <span className="streampanel__amtcur">$</span>
            <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top up amount" />
          </div>
          <button className="btn btn--secondary streampanel__fundbtn" disabled={funding || !isConnected || !eoaAddress} onClick={fund}>
            {funding ? "Funding…" : "Fund"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the existing WalletPanel tests (behavior preserved)**

Run: `pnpm --filter web test walletpanel`
Expected: PASS — all 5 existing tests (the `wagmi`/`fetch` mocks apply to the hook; balances/fund/guards behave identically).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/use-wallet-balances.ts apps/web/components/WalletPanel.tsx
git commit -m "refactor(web): extract useWalletBalances hook; WalletPanel consumes it"
```

---

## Task 3: `WalletBalances` compact component

**Files:**
- Create: `apps/web/components/WalletBalances.tsx`
- Test: `apps/web/test/wallet-balances.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `useWalletBalances` (Task 2).
- Produces: `WalletBalances()` — a no-prop compact read-only balances component. Consumed by Task 6 (rail).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/wallet-balances.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockState: any;
vi.mock("@/lib/use-wallet-balances", () => ({ useWalletBalances: () => mockState }));
import { WalletBalances } from "../components/WalletBalances";

beforeEach(() => { mockState = { walletMicroUsd: 4_000_000, gatewayMicroUsd: 500_000, fundedMicroUsd: 1_000_000, eoaAddress: "0xeoa", address: "0xmeta", refresh: async () => {} }; });

describe("WalletBalances", () => {
  it("shows the wallet + spending balances", () => {
    render(<WalletBalances />);
    expect(screen.getByText(/\$4\.00/)).toBeTruthy();   // wallet 4_000_000 µUSD
    expect(screen.getByText(/\$0\.50/)).toBeTruthy();   // spending 500_000 µUSD
  });
  it("falls back to — and syncing… on nulls", () => {
    mockState = { ...mockState, walletMicroUsd: null, gatewayMicroUsd: null };
    render(<WalletBalances />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/syncing/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test wallet-balances`
Expected: FAIL — cannot resolve `../components/WalletBalances`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/WalletBalances.tsx`:

```tsx
"use client";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";

/** Compact read-only Wallet + Spending balances for the agent rail. */
export function WalletBalances() {
  const { walletMicroUsd, gatewayMicroUsd } = useWalletBalances();
  return (
    <div className="walletbalances">
      <div className="walletbalances__row"><span>Wallet</span><strong>{walletMicroUsd != null ? formatUsd(walletMicroUsd) : "—"}</strong></div>
      <div className="walletbalances__row"><span>Spending</span><strong>{gatewayMicroUsd != null ? formatUsd(gatewayMicroUsd) : "syncing…"}</strong></div>
    </div>
  );
}
```

Add to `apps/web/app/globals.css`:

```css
.walletbalances { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.walletbalances__row { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-2); }
.walletbalances__row strong { color: var(--ink); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test wallet-balances`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/WalletBalances.tsx apps/web/test/wallet-balances.test.tsx apps/web/app/globals.css
git commit -m "feat(web): compact WalletBalances (wallet + spending) for the agent rail"
```

---

## Task 4: `useAgentBytes` realtime hook

**Files:**
- Create: `apps/web/lib/use-agent-bytes.ts`
- Test: `apps/web/test/use-agent-bytes.test.ts`

**Interfaces:**
- Produces: `useAgentBytes(runId: string): number` — total bytes summed across the run's `payment` events (initial fetch + realtime inserts). Consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/use-agent-bytes.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const eq2 = vi.fn(async () => ({ data: [{ content: { bytes: 262144 } }, { content: { bytes: 1_000_000 } }] }));
const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: eq2 }) }) }),
    channel: () => channel,
    removeChannel: vi.fn(),
  }),
}));
import { useAgentBytes } from "../lib/use-agent-bytes";

beforeEach(() => vi.clearAllMocks());

describe("useAgentBytes", () => {
  it("sums bytes across the run's payment events", async () => {
    const { result } = renderHook(() => useAgentBytes("run-1"));
    await waitFor(() => expect(result.current).toBe(1_262_144)); // 262144 + 1_000_000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test use-agent-bytes`
Expected: FAIL — cannot resolve `../lib/use-agent-bytes`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/use-agent-bytes.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

/** Live total bytes fetched across the run's payment events (initial sum + realtime INSERTs). */
export function useAgentBytes(runId: string): number {
  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    void (async () => {
      const { data } = await sb.from("agent_events").select("content").eq("run_id", runId).eq("kind", "payment");
      if (!cancelled && data) setBytes(data.reduce((sum: number, r: any) => sum + Number(r.content?.bytes ?? 0), 0));
    })();
    const channel = sb.channel(`agent-bytes-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p: any) => { if (p.new?.kind === "payment") setBytes((b) => b + Number(p.new.content?.bytes ?? 0)); })
      .subscribe();
    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [runId]);
  return bytes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test use-agent-bytes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/use-agent-bytes.ts apps/web/test/use-agent-bytes.test.ts
git commit -m "feat(web): useAgentBytes — realtime total bytes across a run's payments"
```

---

## Task 5: `SavingsBenchmark` component

**Files:**
- Create: `apps/web/components/SavingsBenchmark.tsx`
- Test: `apps/web/test/savings-benchmark.test.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `residentialSavings`, `RESIDENTIAL_MARKUP` (Task 1).
- Produces: `SavingsBenchmark({ bytes, spentMicroUsd, refUsdPerGb })`. Consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/savings-benchmark.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SavingsBenchmark } from "../components/SavingsBenchmark";

describe("SavingsBenchmark", () => {
  it("shows the saved amount + % and an estimate marker when savings are positive", () => {
    render(<SavingsBenchmark bytes={1_000_000} spentMicroUsd={1000} refUsdPerGb={15} />); // saved 14000 µUSD, 93%
    expect(screen.getByText(/Saved/)).toBeTruthy();
    expect(screen.getByText(/\$0\.0140/)).toBeTruthy();
    expect(screen.getByText(/93%/)).toBeTruthy();
    expect(screen.getByText(/est\.|estimate/i)).toBeTruthy();
  });
  it("shows the detail only (no 'Saved') when the reference is below what was paid", () => {
    render(<SavingsBenchmark bytes={500} spentMicroUsd={1000} refUsdPerGb={15} />); // reference 8 < paid 1000
    expect(screen.queryByText(/Saved/)).toBeNull();
    expect(screen.getByText(/you paid/i)).toBeTruthy();
    expect(screen.getByText(/est\.|estimate/i)).toBeTruthy();
  });
  it("shows 'no savings yet' when there are no bytes or no chosen node", () => {
    const { rerender } = render(<SavingsBenchmark bytes={0} spentMicroUsd={1000} refUsdPerGb={15} />);
    expect(screen.getByText(/no savings yet/i)).toBeTruthy();
    rerender(<SavingsBenchmark bytes={1_000_000} spentMicroUsd={1000} refUsdPerGb={null} />);
    expect(screen.getByText(/no savings yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test savings-benchmark`
Expected: FAIL — cannot resolve `../components/SavingsBenchmark`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/SavingsBenchmark.tsx`:

```tsx
"use client";
import { residentialSavings, RESIDENTIAL_MARKUP } from "@nanovpn/core";
import { formatUsd } from "./format";

/** Cumulative "money saved vs a residential proxy" for the run — an illustrative estimate, not a quote. */
export function SavingsBenchmark({ bytes, spentMicroUsd, refUsdPerGb }: { bytes: number; spentMicroUsd: number; refUsdPerGb: number | null }) {
  if (bytes <= 0 || refUsdPerGb == null) {
    return (
      <div className="savings">
        <span className="eyebrow">Money saved</span>
        <p className="savings__none">No savings yet</p>
      </div>
    );
  }
  const { referenceMicroUsd, savedMicroUsd, pct } = residentialSavings(bytes, spentMicroUsd, refUsdPerGb);
  const meteredPerGb = (refUsdPerGb / RESIDENTIAL_MARKUP).toFixed(1);
  return (
    <div className="savings">
      <span className="eyebrow">Money saved</span>
      {savedMicroUsd > 0 && <p className="savings__amount">Saved <strong>{formatUsd(savedMicroUsd)}</strong> ({pct}%)</p>}
      <p className="savings__detail">you paid {formatUsd(spentMicroUsd)} · vs residential proxy ≈ {formatUsd(referenceMicroUsd)}</p>
      <p className="savings__note">est. — residential proxy ≈ ${refUsdPerGb.toFixed(0)}/GB (~{RESIDENTIAL_MARKUP}× a ${meteredPerGb}/GB metered rate)</p>
    </div>
  );
}
```

Add to `apps/web/app/globals.css`:

```css
.savings { margin-top: 14px; }
.savings__amount { font-size: 15px; color: var(--ink); margin: 4px 0 2px; }
.savings__amount strong { color: var(--green); }
.savings__detail { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-2); }
.savings__note { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
.savings__none { font-size: 12.5px; color: var(--muted); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test savings-benchmark`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/SavingsBenchmark.tsx apps/web/test/savings-benchmark.test.tsx apps/web/app/globals.css
git commit -m "feat(web): SavingsBenchmark — illustrative per-location savings vs a residential proxy"
```

---

## Task 6: Wire `AgentStatusRail` (WalletBalances + SavingsBenchmark)

**Files:**
- Modify: `apps/web/components/AgentStatusRail.tsx`
- Test: `apps/web/test/agent-status-rail.test.tsx`

**Interfaces:**
- Consumes: `WalletBalances` (Task 3), `useAgentBytes` (Task 4), `SavingsBenchmark` (Task 5), `RESIDENTIAL_MARKUP` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/agent-status-rail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/WorldMap", () => ({ WorldMap: () => <div>map</div> }));
vi.mock("@/components/WalletBalances", () => ({ WalletBalances: () => <div>wallet-balances</div> }));
let benchProps: any;
vi.mock("@/components/SavingsBenchmark", () => ({ SavingsBenchmark: (p: any) => { benchProps = p; return <div>savings:{p.refUsdPerGb}</div>; } }));
vi.mock("@/lib/use-agent-bytes", () => ({ useAgentBytes: () => 1_000_000 }));
vi.mock("@/lib/use-agent-run-status", () => ({ useAgentRunStatus: () => ({ nodeId: "tokyo-1", spentMicroUsd: 2000, status: "running" }) }));

import { AgentStatusRail } from "../components/AgentStatusRail";
const nodes = [{ id: "tokyo-1", geo: { city: "Tokyo", country: "Japan", lat: 35, lng: 139 }, operatorAddress: "0x0", proxyUrl: "", settleUrl: "", pricePerGbUsd: 3.0, pricePerRequestUsd: 0.001 }] as any;

beforeEach(() => { benchProps = null; });

describe("AgentStatusRail money context", () => {
  it("renders WalletBalances and SavingsBenchmark with the chosen node's per-location reference rate", () => {
    render(<AgentStatusRail runId="r1" initialNodeId="tokyo-1" initialSpentMicroUsd={2000} budgetMicroUsd={50000} initialStatus="running" nodes={nodes} />);
    expect(screen.getByText("wallet-balances")).toBeTruthy();
    expect(benchProps.bytes).toBe(1_000_000);
    expect(benchProps.spentMicroUsd).toBe(2000);
    expect(benchProps.refUsdPerGb).toBe(15); // tokyo pricePerGbUsd 3.0 × RESIDENTIAL_MARKUP 5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-status-rail`
Expected: FAIL — the rail doesn't render WalletBalances/SavingsBenchmark yet.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/components/AgentStatusRail.tsx` with:

```tsx
"use client";
import { WorldMap } from "./WorldMap";
import { WalletBalances } from "./WalletBalances";
import { SavingsBenchmark } from "./SavingsBenchmark";
import { formatUsd } from "./format";
import { useAgentRunStatus } from "@/lib/use-agent-run-status";
import { useAgentBytes } from "@/lib/use-agent-bytes";
import { RESIDENTIAL_MARKUP } from "@nanovpn/core";
import type { NodeListing } from "@nanovpn/core";

export function AgentStatusRail({ runId, initialNodeId, initialSpentMicroUsd, budgetMicroUsd, initialStatus, nodes }: {
  runId: string; initialNodeId: string | null; initialSpentMicroUsd: number; budgetMicroUsd: number; initialStatus: string; nodes: NodeListing[];
}) {
  const { nodeId, spentMicroUsd, status } = useAgentRunStatus(runId, { nodeId: initialNodeId, spentMicroUsd: initialSpentMicroUsd, status: initialStatus });
  const bytes = useAgentBytes(runId);
  const pct = budgetMicroUsd > 0 ? Math.min(100, Math.round((spentMicroUsd / budgetMicroUsd) * 100)) : 0;
  const chosen = nodes.find((n) => n.id === nodeId) ?? null;
  const refUsdPerGb = chosen ? chosen.pricePerGbUsd * RESIDENTIAL_MARKUP : null;
  return (
    <aside className="agent-rail">
      <span className="eyebrow">Chosen node</span>
      <div className="agent-rail__globe">
        <WorldMap nodes={nodes} selectedId={nodeId} connected={!!nodeId} streaming={null} onSelect={() => {}} interactive={false} />
      </div>
      <div className="agent-rail__node">{chosen ? `● ${chosen.geo.city}, ${chosen.geo.country}` : "choosing…"}</div>
      <span className="eyebrow">Budget</span>
      <div className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></div>
      <div className="agent-rail__spend">{formatUsd(spentMicroUsd)} / {formatUsd(budgetMicroUsd)}</div>
      <WalletBalances />
      <div className="agent-rail__status" data-status={status}>{status.replace("_", " ")}</div>
      <SavingsBenchmark bytes={bytes} spentMicroUsd={spentMicroUsd} refUsdPerGb={refUsdPerGb} />
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test agent-status-rail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/AgentStatusRail.tsx apps/web/test/agent-status-rail.test.tsx
git commit -m "feat(web): agent rail shows wallet balances + savings benchmark"
```

---

## Task 7: `AgentWalletPanel` at the top of the agent page

**Files:**
- Create: `apps/web/components/AgentWalletPanel.tsx`
- Modify: `apps/web/app/agent/page.tsx`
- Test: `apps/web/test/agent-wallet-panel.test.tsx`

**Interfaces:**
- Consumes: `useWallet` (`@/components/WalletProvider`, provides `signedIn`), `WalletPanel` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/agent-wallet-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let signedIn: string | null = "0xabc";
vi.mock("@/components/WalletProvider", () => ({ useWallet: () => ({ signedIn }) }));
vi.mock("@/components/WalletPanel", () => ({ WalletPanel: () => <div>wallet-panel</div> }));
import { AgentWalletPanel } from "../components/AgentWalletPanel";

describe("AgentWalletPanel", () => {
  it("renders the WalletPanel when signed in", () => {
    signedIn = "0xabc";
    render(<AgentWalletPanel />);
    expect(screen.getByText("wallet-panel")).toBeTruthy();
  });
  it("renders nothing when not signed in", () => {
    signedIn = null;
    const { container } = render(<AgentWalletPanel />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-wallet-panel`
Expected: FAIL — cannot resolve `../components/AgentWalletPanel`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/components/AgentWalletPanel.tsx`:

```tsx
"use client";
import { useWallet } from "./WalletProvider";
import { WalletPanel } from "./WalletPanel";

/** The full wallet panel (balances + Fund) at the top of the agent page — only when signed in. */
export function AgentWalletPanel() {
  const { signedIn } = useWallet();
  return signedIn ? <WalletPanel /> : null;
}
```

In `apps/web/app/agent/page.tsx`, add the import next to the other component imports:

```tsx
import { AgentWalletPanel } from "@/components/AgentWalletPanel";
```

And render `<AgentWalletPanel />` immediately after `<AgentRunForm />` in BOTH return branches (the `if (!row)` empty state and the run-loaded return):

```tsx
      <AgentRunForm />
      <AgentWalletPanel />
```

- [ ] **Step 4: Run test to verify it passes + full web suite + build**

Run: `pnpm --filter web test agent-wallet-panel && pnpm --filter web test && pnpm --filter web build`
Expected: the new test passes; the full web suite is green; Next build clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/AgentWalletPanel.tsx apps/web/app/agent/page.tsx apps/web/test/agent-wallet-panel.test.tsx
git commit -m "feat(web): show the wallet panel at the top of the agent page (signed-in only)"
```

---

## Deployment (after all tasks + review)

Web-only. `vercel deploy --prod` from repo root. **Live check (Martin):** on `/agent`, signed in → the wallet + spending balances show at the top (with Fund) before running; launch a run → the rail shows the compact balances next to Budget and a "Money saved" estimate that grows as the agent pays.

---

## Self-Review

**1. Spec coverage:**
- `residentialSavings` + `RESIDENTIAL_MARKUP` (§E) → Task 1 ✓
- `useWalletBalances` hook + WalletPanel refactor (§A, §B) → Task 2 ✓
- Compact `WalletBalances` (§C) → Task 3 ✓
- `useAgentBytes` realtime bytes (§F) → Task 4 ✓
- `SavingsBenchmark` with estimate labeling (§G, audit) → Task 5 ✓
- Rail wiring: WalletBalances + SavingsBenchmark + `refUsdPerGb = node.pricePerGbUsd × markup` (§H) → Task 6 ✓
- Top `AgentWalletPanel` gated on signed-in (§D, §I) → Task 7 ✓
- CSS (§J) → Tasks 3 & 5 ✓
- No route/DB changes; µUSD/6-dec; honest/never-negative savings → Global Constraints + Tasks 1/5 ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete.

**3. Type consistency:** `useWalletBalances()` return shape (Task 2) is consumed field-for-field by WalletPanel + WalletBalances (Tasks 2/3). `residentialSavings(bytes, paidMicroUsd, refUsdPerGb)` (Task 1) is called with those exact args in SavingsBenchmark (Task 5). `SavingsBenchmark` props `{ bytes, spentMicroUsd, refUsdPerGb }` (Task 5) match the rail's render (Task 6). `useAgentBytes(runId): number` (Task 4) feeds `bytes` (Task 6). `RESIDENTIAL_MARKUP` used in Task 5 + Task 6. `formatUsd` takes µUSD in all call sites. `NodeListing.pricePerGbUsd` exists on the rail's `nodes`.
