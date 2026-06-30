# Plan 2b — MetaMask self-funding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user move their own testnet USDC from the already-connected MetaMask into their spending wallet (which deposits to Gateway), unlocking capped wallets and enabling top-ups.

**Architecture:** A client "Fund from your wallet" control in `FetchPanel` uses wagmi `writeContractAsync` to `USDC.transfer(spendingEOA, amount)` (MetaMask popup), waits for the receipt, then `POST /api/self-fund`. The route reads the EOA's *actual* USDC balance, sponsors tiny gas if needed, deposits it to Gateway, and **increments** `funded_micro_usd` (status→`funded`, source→`metamask`).

**Tech Stack:** Next.js route handlers, wagmi (`useWriteContract`/`usePublicClient`/`useAccount`), viem, `@circle-fin/x402-batching/client`, Supabase service-role, vitest.

Implements spec `docs/superpowers/specs/2026-06-30-plan2b-metamask-self-funding-design.md`. Builds on the shipped hardening (`main` `9722b7f`: `funding_status`, the $0.10 grant/cap). No migration, no edge-node change.

## Global Constraints

- **Testnet only** (Arc `eip155:5042002`); secrets from env, never logged.
- **USDC 6 decimals** (`ARC.usdcDecimals`, `ARC.usdc = 0x3600…`). `parseUnits(x,6)` / `formatUnits(x,6)`. 6-dec atomic == µUSD.
- **Backend deposits the EOA's REAL on-chain balance** (not a client-claimed amount) — trust-minimized + idempotent (double-click finds 0 left).
- **`addFunding` INCREMENTS** `funded_micro_usd` (the increment the deleted `markFunded` lacked) and sets `funding_status='funded'`, `funding_source='metamask'`.
- **Sponsor gas** only when the EOA's native balance is low (`SPONSOR_PRIVATE_KEY ?? BUYER_PRIVATE_KEY`; amount `USER_GAS_NATIVE`, default `"0.05"`). Gas, not grant — not cap-gated.
- **No new connect step** — the wallet is already connected (`WalletProvider` uses wagmi `injected`); use wagmi hooks directly in `FetchPanel`.
- **Route authed:** `/api/self-fund` requires the `siwe-address` cookie (401), `userId = address.toLowerCase()`.
- **Verbatim imports:** `import { GatewayClient } from "@circle-fin/x402-batching/client";` · `import { ARC, arcPublicClient } from "@nanovpn/core";` · `import { arcTestnet } from "viem/chains";` · `supabaseService` from `@/lib/supabase-server`.
- **Existing patterns:** route handlers `export const runtime = "nodejs"` + `NextRequest`; server-only libs `import "server-only";`; tests mock the imported libs, route tests build a `NextRequest` with a `siwe-address` cookie, spies in `vi.hoisted()`.

## File structure

| File | Change |
|------|--------|
| `apps/web/lib/user-wallet.ts` (modify) | add `addFunding(userId, microUsd, source)` (increment) |
| `apps/web/lib/self-fund.ts` (new) | `depositOwnBalance(eoaPrivateKey)` — read balance, sponsor gas if low, deposit, return µUSD |
| `apps/web/app/api/self-fund/route.ts` (new) | authed: provision → load key → deposit own balance → addFunding |
| `apps/web/components/FetchPanel.tsx` (modify) | keep `eoaAddress`/`fundingStatus` from the wallet fetch; add the self-fund control (wagmi) |
| `apps/web/app/globals.css` (modify) | self-fund block styles |
| `apps/web/test/*` | per tasks |

---

## Task 1: `addFunding` (increment) in `user-wallet.ts`

**Files:**
- Modify: `apps/web/lib/user-wallet.ts`
- Modify: `apps/web/test/user-wallet.test.ts`

**Interfaces:**
- Produces: `addFunding(userId: string, microUsd: number, source: string): Promise<number>` — increments `funded_micro_usd` by `microUsd`, sets `funding_status='funded'` + `funding_source=source`, returns the new total.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/user-wallet.test.ts` (it has an in-memory `rows` + `fakeDb` mock and imports from `../lib/user-wallet`; add `addFunding` to that import):

```ts
  it("addFunding increments funded_micro_usd and flips status/source", async () => {
    await getOrCreateUserWallet("0xu");
    rows[0].funded_micro_usd = 100_000;
    rows[0].funding_status = "unfunded";
    const total = await addFunding("0xu", 1_000_000, "metamask");
    expect(total).toBe(1_100_000);
    expect(rows[0].funded_micro_usd).toBe(1_100_000);
    expect(rows[0].funding_status).toBe("funded");
    expect(rows[0].funding_source).toBe("metamask");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- user-wallet`
Expected: FAIL — `addFunding` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/user-wallet.ts`:

```ts
/** Add to the user's funded balance (e.g. a MetaMask self-fund deposit). Increments, sets status/source. */
export async function addFunding(userId: string, microUsd: number, source: string): Promise<number> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const { data, error: readErr } = await db
    .from("user_wallets").select("funded_micro_usd").eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`add funding read failed: ${readErr.message}`);
  const newTotal = Number(data?.funded_micro_usd ?? 0) + microUsd;
  const { error } = await db
    .from("user_wallets")
    .update({ funded_micro_usd: newTotal, funding_status: "funded", funding_source: source })
    .eq("user_id", userId);
  if (error) throw new Error(`add funding failed: ${error.message}`);
  return newTotal;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- user-wallet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/user-wallet.ts apps/web/test/user-wallet.test.ts
git commit -m "feat(web): addFunding — increment funded balance (for self-funding)"
```

---

## Task 2: `depositOwnBalance` in `lib/self-fund.ts`

**Files:**
- Create: `apps/web/lib/self-fund.ts`
- Test: `apps/web/test/self-fund.test.ts`

**Interfaces:**
- Produces: `depositOwnBalance(eoaPrivateKey: \`0x${string}\`): Promise<number>` — reads the EOA's USDC balance; if 0 returns 0; sponsors gas when native is low; deposits the balance to Gateway; returns the µUSD deposited.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/self-fund.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const readContract = vi.fn();
const getBalance = vi.fn();
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
const sendTransaction = vi.fn(async () => "0xgas");
const deposit = vi.fn(async () => ({ depositTxHash: "0xdep" }));

vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ readContract, getBalance, waitForTransactionReceipt }) };
});
vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction }) };
});
vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: vi.fn().mockImplementation(() => ({ deposit })) }));

import { depositOwnBalance } from "../lib/self-fund";
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => { vi.clearAllMocks(); });

describe("depositOwnBalance", () => {
  it("returns 0 and deposits nothing when the EOA holds no USDC", async () => {
    readContract.mockResolvedValue(0n);
    expect(await depositOwnBalance(KEY)).toBe(0);
    expect(deposit).not.toHaveBeenCalled();
  });

  it("sponsors gas (native low) then deposits the balance, returns µUSD", async () => {
    readContract.mockResolvedValue(1_000_000n); // $1 USDC (6 dec)
    getBalance.mockResolvedValue(0n);           // no native → sponsor gas
    const deposited = await depositOwnBalance(KEY);
    expect(sendTransaction).toHaveBeenCalledTimes(1);     // gas sponsored
    expect(deposit).toHaveBeenCalledWith("1");            // formatUnits(1_000_000n, 6)
    expect(deposited).toBe(1_000_000);
  });

  it("skips gas when the EOA already has native", async () => {
    readContract.mockResolvedValue(500_000n);
    getBalance.mockResolvedValue(10n ** 18n);   // plenty of native
    await depositOwnBalance(KEY);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(deposit).toHaveBeenCalledWith("0.5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- self-fund`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/self-fund.ts
import "server-only";
import { createWalletClient, http, parseEther, formatUnits, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";
const MIN_NATIVE = parseEther("0.02"); // sponsor gas if the EOA has less than this

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/** Deposit the EOA's current USDC balance into Gateway (sponsoring small gas if needed). Returns µUSD deposited (0 if none). */
export async function depositOwnBalance(eoaPrivateKey: Hex): Promise<number> {
  const eoa = privateKeyToAccount(eoaPrivateKey);
  const pub = arcPublicClient();
  const balance = (await pub.readContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf", args: [eoa.address],
  })) as bigint;
  if (balance === 0n) return 0;

  const native = await pub.getBalance({ address: eoa.address });
  if (native < MIN_NATIVE) {
    const sponsor = createWalletClient({ account: privateKeyToAccount(sponsorKey()), chain: arcTestnet, transport: http(ARC.rpcUrl) });
    const gasTx = await sponsor.sendTransaction({ to: eoa.address, value: parseEther(GAS_NATIVE) });
    await pub.waitForTransactionReceipt({ hash: gasTx });
  }

  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: eoaPrivateKey });
  await gateway.deposit(formatUnits(balance, ARC.usdcDecimals));
  return Number(balance);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- self-fund`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/self-fund.ts apps/web/test/self-fund.test.ts
git commit -m "feat(web): depositOwnBalance — deposit the EOA's own USDC to Gateway"
```

---

## Task 3: `POST /api/self-fund` route

**Files:**
- Create: `apps/web/app/api/self-fund/route.ts`
- Test: `apps/web/test/self-fund-route.test.ts`

**Interfaces:**
- Consumes: `getOrCreateUserWallet`, `loadSigningKey`, `addFunding` (Task 1); `depositOwnBalance` (Task 2).
- Produces: `POST /api/self-fund` → `{ depositedMicroUsd, fundedMicroUsd }` (401 unauth, 400 if nothing deposited).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/self-fund-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getOrCreateUserWallet = vi.fn(async () => ({ userId: "0xabc", eoaAddress: "0xeoa", fundedMicroUsd: 0, fundingStatus: "unfunded" }));
const loadSigningKey = vi.fn(async () => "0xKEY");
const addFunding = vi.fn(async () => 1_000_000);
const depositOwnBalance = vi.fn(async () => 1_000_000);
vi.mock("@/lib/user-wallet", () => ({ getOrCreateUserWallet, loadSigningKey, addFunding }));
vi.mock("@/lib/self-fund", () => ({ depositOwnBalance }));

import { POST } from "../app/api/self-fund/route";
const req = (cookie?: string) =>
  new NextRequest("http://x/api/self-fund", { method: "POST", headers: cookie ? { cookie } : {} });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/self-fund", () => {
  it("401s when not signed in", async () => {
    expect((await POST(req())).status).toBe(401);
  });
  it("400s when no USDC was deposited", async () => {
    depositOwnBalance.mockResolvedValueOnce(0);
    const res = await POST(req("siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(addFunding).not.toHaveBeenCalled();
  });
  it("deposits + records the funding", async () => {
    const res = await POST(req("siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 1_000_000 });
    expect(addFunding).toHaveBeenCalledWith("0xabc", 1_000_000, "metamask");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- self-fund-route`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/app/api/self-fund/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserWallet, loadSigningKey, addFunding } from "@/lib/user-wallet";
import { depositOwnBalance } from "@/lib/self-fund";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    await getOrCreateUserWallet(userId); // ensure the row/EOA exists
    const key = await loadSigningKey(userId);
    const deposited = await depositOwnBalance(key);
    if (deposited === 0) {
      return NextResponse.json({ error: "no USDC received — transfer to your spending wallet first" }, { status: 400 });
    }
    const fundedMicroUsd = await addFunding(userId, deposited, "metamask");
    return NextResponse.json({ depositedMicroUsd: deposited, fundedMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- self-fund-route`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/self-fund/route.ts apps/web/test/self-fund-route.test.ts
git commit -m "feat(web): POST /api/self-fund — deposit the user's own USDC + record"
```

---

## Task 4: FetchPanel self-fund control (wagmi)

**Files:**
- Modify: `apps/web/components/FetchPanel.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/self-fund`, `GET /api/wallet` (now also `eoaAddress`/`fundingStatus`); wagmi `useWriteContract`/`usePublicClient`/`useAccount`; `ARC.usdc` + `parseUnits` + `erc20Abi`.

- [ ] **Step 1: Update the failing test**

In `apps/web/test/fetch-panel.test.tsx`, mock wagmi at the top (the component now imports it) and add a self-fund test. Add to the existing mocks + cases:

```tsx
const writeContractAsync = vi.fn(async () => "0xhash");
const waitForTransactionReceipt = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0xmeta" }),
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));
```
Extend the `/api/wallet` fetch mock to include `eoaAddress` + `fundingStatus`:
```tsx
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, spentMicroUsd: 0, fundingStatus: "funded" }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 1_100_000 }), { status: 200 });
```
New test:
```tsx
  it("self-funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Fund from your wallet/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Fund from your wallet/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] }); // parseUnits("1",6)
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/self-fund"))).toBe(true));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- fetch-panel`
Expected: FAIL — no "Fund from your wallet" control / wagmi not wired.

- [ ] **Step 3: Implement the component changes**

In `apps/web/components/FetchPanel.tsx`:

Add imports:
```tsx
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";
```
Widen the `balance` state type + keep the new fields:
```tsx
  const [balance, setBalance] = useState<{ eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string } | null>(null);
```
Add the self-fund state + hooks inside the component:
```tsx
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

  async function selfFund() {
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
```
Render a self-fund block (place it right after the balance `<p>`):
```tsx
      <div className="fetchpanel__fund">
        <span className="hint">Fund from your wallet (USDC):</span>
        <input className="fetchpanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" disabled={funding || !isConnected || !balance} onClick={selfFund}>
          {funding ? "Funding…" : "Fund from your wallet"}
        </button>
      </div>
      {fundErr && <p className="hint" style={{ color: "var(--amber)" }}>{fundErr}</p>}
```

- [ ] **Step 4: Add styles**

In `apps/web/app/globals.css` append:
```css
.fetchpanel__fund { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fetchpanel__amt { width: 80px; }
```

- [ ] **Step 5: Run tests + full gate**

Run: `pnpm --filter web test -- fetch-panel` then `pnpm -r build && pnpm -r test`
Expected: fetch-panel tests PASS; build clean; whole suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/app/globals.css apps/web/test/fetch-panel.test.tsx
git commit -m "feat(web): FetchPanel self-fund — transfer USDC from MetaMask to the spending wallet"
```

---

## Manual verification (after all tasks)

Headless can't drive MetaMask, so this one is a real browser pass (you):
1. Sign in on https://nanovpn-web.vercel.app (MetaMask, Arc testnet, your key holds testnet USDC).
2. On `/map` → Connect a node → in the panel, "Fund from your wallet" $1 → approve the USDC transfer in MetaMask → after it confirms, the balance jumps by ~$1 and `fundingStatus` is `funded`.
3. Confirm the `user_wallets` row's `funded_micro_usd` increased and `funding_source='metamask'`.
4. (Cap path) with `MAX_SPONSORED_WALLETS` low, a capped user who self-funds can then fetch/run (no 503).

## Out of scope

Leftover refund; sign-in changes; making self-fund the default; real geo (Plan 3); orphan cleanup. Edge-node untouched.

## Self-review notes (addressed)

- **Spec coverage:** `addFunding` increment (T1); `depositOwnBalance` real-balance + sponsor-gas (T2); authed `/api/self-fund` (T3); FetchPanel wagmi self-fund UI + keep `eoaAddress`/`fundingStatus` (T4). All spec sections mapped.
- **Type consistency:** `depositOwnBalance(key)→µUSD` (T2) consumed by the route (T3); `addFunding(userId,µUSD,source)→total` (T1) consumed by the route (T3); `/api/wallet` now returns `eoaAddress`/`fundingStatus` (shipped in hardening) consumed by FetchPanel (T4). Names align.
- **No placeholders:** every step has real code/commands. `MIN_NATIVE` is a concrete `parseEther("0.02")` threshold. The wagmi mock + the `parseUnits("1",6)===1_000_000n` assertion are spelled out.
- **Existing fetch-panel test:** T4 adds the wagmi mock so the panel (now importing wagmi) still renders under jsdom — existing fetch-panel cases stay green.
