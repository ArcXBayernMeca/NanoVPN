# Honest Funding Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the human VPN panel's "Balance" show the real Circle Gateway available balance, and make self-fund credit `funded_micro_usd` only for deposits confirmed on-chain (killing the silent-credit + double-count and recovering stranded funds).

**Architecture:** A shared `gatewayAvailableMicroUsd` helper reads the live Circle Gateway `/v1/balances`; `/api/wallet` returns it and the panel shows it as "Balance". `depositOwnBalance` deposits via an explicit approve + `deposit(token,value)` with Circle's reference gas caps and waits for both receipts, returning a confirmed amount that `/api/self-fund` credits only on success.

**Tech Stack:** Next.js App Router (Node runtime), viem (Arc testnet), Circle Gateway `/v1/balances`, vitest. Web-only; no DB migration; no edge-node/Fly change.

## Global Constraints

- **Testnet only.** Arc chain `5042002`; USDC is **6 decimals**.
- **No DB migration** — `user_wallets` schema unchanged; `funded_micro_usd` keeps its meaning, now honest.
- **Deposit gas caps** (from Circle's `deposit-evm` reference): approve `120_000n`, deposit `350_000n`.
- **"Confirmed deposit"** = the approve receipt AND the deposit receipt both have `status === "success"`.
- **Credit `funded_micro_usd` only on a confirmed deposit**; on failure → error, credit nothing.
- **`gatewayAvailableMicroUsd`** never throws and never fabricates: returns `null` for a malformed address (guard `/^0x[0-9a-fA-F]{40}$/`) or any API error.
- **Never modify Circle EIP-712 / signing payloads** (N/A here — deposit is a plain on-chain approve+deposit).
- **Keep the existing test suite green** (`pnpm -r test`).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/web/lib/gateway-balance.ts` | live Gateway available balance → µUSD (or null) | Create |
| `apps/web/test/gateway-balance.test.ts` | parse / null-guard tests | Create |
| `apps/web/app/api/balance/route.ts` | use the shared helper (DRY) | Modify |
| `apps/web/lib/self-fund.ts` | explicit approve+deposit (gas caps) + receipt checks | Modify |
| `apps/web/test/self-fund.test.ts` | approve+deposit + throw-on-revert tests | Modify |
| `apps/web/app/api/self-fund/route.ts` | 400 + no credit on unconfirmed; return `gatewayMicroUsd` | Modify |
| `apps/web/test/self-fund-route.test.ts` | unconfirmed → 400; response includes `gatewayMicroUsd` | Modify |
| `apps/web/app/api/wallet/route.ts` | return `gatewayMicroUsd` | Modify |
| `apps/web/test/wallet-route.test.ts` | asserts `gatewayMicroUsd` | Modify |
| `apps/web/components/FetchPanel.tsx` | Balance = live Gateway / "syncing…" | Modify |
| `apps/web/test/fetch-panel.test.tsx` | Balance shows Gateway number / "syncing…" | Modify |

---

## Task 1: `gatewayAvailableMicroUsd` helper (+ DRY the balance route)

**Files:**
- Create: `apps/web/lib/gateway-balance.ts`
- Create: `apps/web/test/gateway-balance.test.ts`
- Modify: `apps/web/app/api/balance/route.ts`

**Interfaces:**
- Produces: `gatewayAvailableMicroUsd(address: string): Promise<number | null>` — live Circle Gateway *available* USDC balance for `address` in integer µUSD; `null` on malformed address or API error. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/gateway-balance.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gatewayAvailableMicroUsd } from "../lib/gateway-balance";

const ADDR = "0x1B09Af2b2F079CCd8b0caC0252338e3A2089661C";

beforeEach(() => vi.restoreAllMocks());

describe("gatewayAvailableMicroUsd", () => {
  it("returns null for a malformed address without calling the API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await gatewayAvailableMicroUsd("not-an-address")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses the decimal available balance into integer µUSD", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ balances: [{ balance: "0.081935" }] }), { status: 200 }),
    );
    expect(await gatewayAvailableMicroUsd(ADDR)).toBe(81935);
  });

  it("returns null on a non-OK response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 502 }));
    expect(await gatewayAvailableMicroUsd(ADDR)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test gateway-balance`
Expected: FAIL — cannot resolve `../lib/gateway-balance`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/gateway-balance.ts`:

```ts
import { ARC } from "@nanovpn/core";

/**
 * Live Circle Gateway *available* USDC balance for an address, in integer µUSD.
 * Returns null for a malformed address or any API error — never throws, never fabricates.
 * `balance` from /v1/balances is the available balance (excludes still-finalizing deposits,
 * which the response reports separately as `pendingBatch`).
 */
export async function gatewayAvailableMicroUsd(address: string): Promise<number | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  try {
    const r = await fetch(`${ARC.facilitator}/v1/balances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token: "USDC", sources: [{ domain: ARC.domain, depositor: address }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const balance = data?.balances?.[0]?.balance;
    if (balance == null) return null;
    return Math.round(Number(balance) * 1e6);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test gateway-balance`
Expected: PASS (3 tests).

- [ ] **Step 5: DRY the balance route**

Replace `apps/web/app/api/balance/route.ts` with (keeps the `{ usdc }` response shape):

```ts
import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { gatewayAvailableMicroUsd } from "@/lib/gateway-balance";

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "missing address" }, { status: 400 });
  const micro = await gatewayAvailableMicroUsd(address);
  if (micro == null) return NextResponse.json({ error: "gateway error" }, { status: 502 });
  return NextResponse.json({ usdc: formatUnits(BigInt(micro), 6) });
}
```

- [ ] **Step 6: Run the web test suite to confirm no regression**

Run: `pnpm --filter web test gateway-balance`
Expected: PASS. (There is no test for `/api/balance`; it has no consumers, and the `{ usdc }` shape is unchanged.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/gateway-balance.ts apps/web/test/gateway-balance.test.ts apps/web/app/api/balance/route.ts
git commit -m "feat(web): gatewayAvailableMicroUsd helper + DRY the balance route"
```

---

## Task 2: `depositOwnBalance` — explicit approve+deposit with gas caps + receipt checks

**Files:**
- Modify: `apps/web/lib/self-fund.ts`
- Test: `apps/web/test/self-fund.test.ts`

**Interfaces:**
- Produces: `depositOwnBalance(eoaPrivateKey: Hex): Promise<number>` — deposits the EOA's whole USDC balance into Gateway via approve + `deposit(token,value)` with gas caps; **throws** if either receipt is not `success`; returns the confirmed µUSD (0 if the EOA holds no USDC). Consumed by Task 3 (route).

- [ ] **Step 1: Update the test (failing)**

Replace `apps/web/test/self-fund.test.ts` with (mocks `writeContract` for approve+deposit; drops the GatewayClient path):

```ts
// apps/web/test/self-fund.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const readContract = vi.fn();
const getBalance = vi.fn();
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const }));
const sendTransaction = vi.fn(async () => "0xgas");
const writeContract = vi.fn(async () => "0xtx");

vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ readContract, getBalance, waitForTransactionReceipt }) };
});
vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction, writeContract }) };
});

import { depositOwnBalance } from "../lib/self-fund";
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => {
  vi.clearAllMocks();
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("depositOwnBalance", () => {
  it("returns 0 and deposits nothing when the EOA holds no USDC", async () => {
    readContract.mockResolvedValue(0n);
    expect(await depositOwnBalance(KEY)).toBe(0);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("sponsors gas (native low), approves + deposits with the reference gas caps, returns µUSD", async () => {
    readContract.mockResolvedValue(1_000_000n); // $1 USDC
    getBalance.mockResolvedValue(0n);           // no native → sponsor gas
    const deposited = await depositOwnBalance(KEY);
    expect(sendTransaction).toHaveBeenCalledTimes(1);            // gas sponsored
    expect(writeContract).toHaveBeenCalledTimes(2);              // approve + deposit
    expect(writeContract.mock.calls[0][0]).toMatchObject({ functionName: "approve", gas: 120_000n });
    expect(writeContract.mock.calls[1][0]).toMatchObject({ functionName: "deposit", gas: 350_000n });
    expect(deposited).toBe(1_000_000);
  });

  it("skips gas when the EOA already has native", async () => {
    readContract.mockResolvedValue(500_000n);
    getBalance.mockResolvedValue(10n ** 18n);
    await depositOwnBalance(KEY);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(writeContract).toHaveBeenCalledTimes(2);
  });

  it("throws when a deposit receipt is not success (credit nothing)", async () => {
    readContract.mockResolvedValue(1_000_000n);
    getBalance.mockResolvedValue(10n ** 18n);
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    await expect(depositOwnBalance(KEY)).rejects.toThrow(/deposit transaction failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test self-fund.test`
Expected: FAIL — current code calls `gateway.deposit` (no `writeContract`), so the approve/deposit assertions and the revert test fail.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/lib/self-fund.ts` with:

```ts
// apps/web/lib/self-fund.ts
import "server-only";
import { createWalletClient, http, parseEther, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";
const MIN_NATIVE = parseEther("0.02"); // sponsor gas if the EOA has less than this

// Gas caps from Circle's deposit-evm reference (avoid overestimating / hitting max tx gas).
const APPROVE_GAS = 120_000n;
const DEPOSIT_GAS = 350_000n;

// Gateway Wallet deposit(token, value) — from Circle's deposit-evm reference.
const GATEWAY_WALLET_DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/**
 * Deposit the EOA's current USDC balance into Gateway via an explicit approve + deposit
 * (Circle deposit-evm pattern + gas caps). Waits for both receipts; THROWS if either is not
 * `success`. Sponsors a little native gas if the EOA is low. Returns confirmed µUSD (0 if none).
 */
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

  const wallet = createWalletClient({ account: eoa, chain: arcTestnet, transport: http(ARC.rpcUrl) });

  const approveTx = await wallet.writeContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "approve", args: [ARC.gatewayWallet, balance], gas: APPROVE_GAS,
  });
  const approveReceipt = await pub.waitForTransactionReceipt({ hash: approveTx });
  if (approveReceipt.status !== "success") throw new Error("deposit transaction failed (approve)");

  const depositTx = await wallet.writeContract({
    address: ARC.gatewayWallet, abi: GATEWAY_WALLET_DEPOSIT_ABI, functionName: "deposit", args: [ARC.usdc, balance], gas: DEPOSIT_GAS,
  });
  const depositReceipt = await pub.waitForTransactionReceipt({ hash: depositTx });
  if (depositReceipt.status !== "success") throw new Error("deposit transaction failed");

  return Number(balance); // USDC atomic units (6 dec) == µUSD
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test self-fund.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/self-fund.ts apps/web/test/self-fund.test.ts
git commit -m "fix(web): self-fund deposits via approve+deposit with gas caps + receipt checks"
```

---

## Task 3: `/api/self-fund` — error + no credit on unconfirmed; return `gatewayMicroUsd`

**Files:**
- Modify: `apps/web/app/api/self-fund/route.ts`
- Test: `apps/web/test/self-fund-route.test.ts`

**Interfaces:**
- Consumes: `depositOwnBalance` (Task 2), `gatewayAvailableMicroUsd` (Task 1).
- Produces: POST response `{ depositedMicroUsd, fundedMicroUsd, gatewayMicroUsd }` on success; 400 (no `addFunding`) when the deposit is unconfirmed or zero.

- [ ] **Step 1: Update the test (failing)**

Replace `apps/web/test/self-fund-route.test.ts` with:

```ts
// apps/web/test/self-fund-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getOrCreateUserWallet, loadSigningKey, addFunding, depositOwnBalance, gatewayAvailableMicroUsd } = vi.hoisted(() => ({
  getOrCreateUserWallet: vi.fn(async () => ({ userId: "0xabc", eoaAddress: "0xeoa", fundedMicroUsd: 0, fundingStatus: "unfunded" })),
  loadSigningKey: vi.fn(async () => "0xKEY"),
  addFunding: vi.fn(async () => 1_000_000),
  depositOwnBalance: vi.fn(async () => 1_000_000),
  gatewayAvailableMicroUsd: vi.fn(async () => 2_000_000),
}));

vi.mock("@/lib/user-wallet", () => ({ getOrCreateUserWallet, loadSigningKey, addFunding }));
vi.mock("@/lib/self-fund", () => ({ depositOwnBalance }));
vi.mock("@/lib/gateway-balance", () => ({ gatewayAvailableMicroUsd }));

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
  it("400s and credits nothing when the deposit throws (not confirmed)", async () => {
    depositOwnBalance.mockRejectedValueOnce(new Error("deposit transaction failed"));
    const res = await POST(req("siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(addFunding).not.toHaveBeenCalled();
  });
  it("credits only the confirmed deposit and returns the live gateway balance", async () => {
    const res = await POST(req("siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 1_000_000, gatewayMicroUsd: 2_000_000 });
    expect(addFunding).toHaveBeenCalledWith("0xabc", 1_000_000, "metamask");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test self-fund-route`
Expected: FAIL — the throw-path returns 500 (not 400), and the success response lacks `gatewayMicroUsd`.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/app/api/self-fund/route.ts` with:

```ts
// apps/web/app/api/self-fund/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserWallet, loadSigningKey, addFunding } from "@/lib/user-wallet";
import { depositOwnBalance } from "@/lib/self-fund";
import { gatewayAvailableMicroUsd } from "@/lib/gateway-balance";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    const wallet = await getOrCreateUserWallet(userId); // ensure the row/EOA exists
    const key = await loadSigningKey(userId);

    let deposited: number;
    try {
      deposited = await depositOwnBalance(key);
    } catch {
      // The deposit did not confirm on-chain — the user's USDC is still in their EOA. Credit nothing.
      return NextResponse.json({ error: "deposit didn't go through — your USDC is safe in your wallet, try again" }, { status: 400 });
    }
    if (deposited <= 0) {
      return NextResponse.json({ error: "no USDC received — transfer to your spending wallet first" }, { status: 400 });
    }

    const fundedMicroUsd = await addFunding(userId, deposited, "metamask");
    const gatewayMicroUsd = await gatewayAvailableMicroUsd(wallet.eoaAddress);
    return NextResponse.json({ depositedMicroUsd: deposited, fundedMicroUsd, gatewayMicroUsd });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test self-fund-route`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/self-fund/route.ts apps/web/test/self-fund-route.test.ts
git commit -m "fix(web): /api/self-fund credits only confirmed deposits + returns live gateway balance"
```

---

## Task 4: `/api/wallet` — return `gatewayMicroUsd`

**Files:**
- Modify: `apps/web/app/api/wallet/route.ts`
- Test: `apps/web/test/wallet-route.test.ts`

**Interfaces:**
- Consumes: `gatewayAvailableMicroUsd` (Task 1).
- Produces: GET response gains `gatewayMicroUsd: number | null` (alongside `eoaAddress`, `fundedMicroUsd`, `spentMicroUsd`, `fundingStatus`). Consumed by Task 5 (FetchPanel).

- [ ] **Step 1: Update the test (failing)**

In `apps/web/test/wallet-route.test.ts`, add a hoisted mock for the gateway-balance lib and assert `gatewayMicroUsd` in the response. Replace the file with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { ensureProvisionedAndFunded, gatewayAvailableMicroUsd } = vi.hoisted(() => ({
  ensureProvisionedAndFunded: vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, status: "funded" })),
  gatewayAvailableMicroUsd: vi.fn(async () => 750_000),
}));
vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded }));
vi.mock("@/lib/gateway-balance", () => ({ gatewayAvailableMicroUsd }));
const rows = [{ amount_micro_usd: 1000 }, { amount_micro_usd: 2000 }];
vi.mock("@/lib/supabase-server", () => ({
  supabaseService: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }),
}));

import { GET } from "../app/api/wallet/route";
const req = (cookie?: string) =>
  new NextRequest("http://x/api/wallet", { headers: cookie ? { cookie } : {} });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/wallet", () => {
  it("401s when not signed in", async () => {
    expect((await GET(req())).status).toBe(401);
  });
  it("returns the funded wallet + summed spend + live gateway balance", async () => {
    const res = await GET(req("siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 3000, gatewayMicroUsd: 750_000, fundingStatus: "funded",
    });
    expect(ensureProvisionedAndFunded).toHaveBeenCalledWith("0xabc");
    expect(gatewayAvailableMicroUsd).toHaveBeenCalledWith("0xeoa");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test wallet-route`
Expected: FAIL — response lacks `gatewayMicroUsd`.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/app/api/wallet/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureProvisionedAndFunded } from "@/lib/user-wallet";
import { gatewayAvailableMicroUsd } from "@/lib/gateway-balance";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();
  try {
    const wallet = await ensureProvisionedAndFunded(userId);
    const { data, error } = await supabaseService()
      .from("settlements").select("amount_micro_usd").eq("payer", wallet.eoaAddress);
    if (error) throw new Error(`spend query failed: ${error.message}`);
    const spentMicroUsd = (data ?? []).reduce((s: number, r: any) => s + Number(r.amount_micro_usd), 0);
    const gatewayMicroUsd = await gatewayAvailableMicroUsd(wallet.eoaAddress);
    return NextResponse.json({
      eoaAddress: wallet.eoaAddress, fundedMicroUsd: wallet.fundedMicroUsd, spentMicroUsd, gatewayMicroUsd, fundingStatus: wallet.status,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test wallet-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/wallet/route.ts apps/web/test/wallet-route.test.ts
git commit -m "feat(web): /api/wallet returns the live gateway balance (gatewayMicroUsd)"
```

---

## Task 5: FetchPanel — "Balance" shows the live Gateway balance (or "syncing…")

**Files:**
- Modify: `apps/web/components/FetchPanel.tsx:15,80,111`
- Test: `apps/web/test/fetch-panel.test.tsx`

**Interfaces:**
- Consumes: `gatewayMicroUsd` from `/api/wallet` (Task 4).
- Produces: UI only.

- [ ] **Step 1: Update the tests (failing)**

In `apps/web/test/fetch-panel.test.tsx`:

(a) In `beforeEach`, add `gatewayMicroUsd` to the `/api/wallet` mock response:

```ts
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: 500_000 }), { status: 200 });
```

(b) Add two tests inside `describe("FetchPanel streaming", …)`:

```ts
  it("shows the live Gateway available balance as Balance", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/\$0\.50/)).toBeTruthy()); // gatewayMicroUsd 500_000 = $0.50
  });

  it("shows 'syncing…' when the gateway balance is unavailable", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: null }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/syncing/i)).toBeTruthy());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test fetch-panel`
Expected: FAIL — Balance still shows `funded − spent` ($1.00), not `$0.50`; no "syncing…" element.

- [ ] **Step 3: Write the implementation**

In `apps/web/components/FetchPanel.tsx`:

(a) Line 15 — add `gatewayMicroUsd` to the `balance` state type:

```tsx
  const [balance, setBalance] = useState<{ eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string; gatewayMicroUsd: number | null } | null>(null);
```

(b) Line 80 — delete the now-unused `remaining`:

```tsx
  // (removed) const remaining = balance ? balance.fundedMicroUsd - balance.spentMicroUsd : 0;
```

Delete that line entirely.

(c) Line 111 — replace the balance line with the live-Gateway / syncing version:

```tsx
        <p className="streampanel__bal">Balance{" "}
          {balance.gatewayMicroUsd == null
            ? <span className="streampanel__sub">syncing…</span>
            : <><strong>{formatUsd(balance.gatewayMicroUsd)}</strong> <span className="streampanel__sub">of {formatUsd(balance.fundedMicroUsd)} funded</span></>}
        </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test fetch-panel`
Expected: PASS — all fetch-panel tests (streaming, self-fund, zero-amount, the 2 new balance tests).

- [ ] **Step 5: Full web suite + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: all web tests pass; Next build clean (confirms no unused-var/type break from removing `remaining`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/FetchPanel.tsx apps/web/test/fetch-panel.test.tsx
git commit -m "feat(web): panel Balance shows the live gateway balance (syncing when unavailable)"
```

---

## Deployment (after all tasks + review)

Web-only. `vercel deploy --prod` from repo root. **Live verify (Martin):** open `/map`, sign in → the "Balance" shows the real Gateway number (≈ your $0.08, not the old $3.17); click **Fund** once → the stranded ~$2.04 in the spending EOA deposits and the Balance jumps to reflect it (confirming both the confirmed-credit path and stranded-fund recovery).

---

## Self-Review

**1. Spec coverage:**
- Live Gateway balance helper (§A) → Task 1 ✓
- Balance route DRY (§A) → Task 1 ✓
- Confirmed-deposit crediting via approve+deposit gas caps + receipt checks (§B) → Task 2 ✓
- Self-fund error/no-credit on unconfirmed + return `gatewayMicroUsd` (§C) → Task 3 ✓
- `/api/wallet` returns `gatewayMicroUsd` (§D) → Task 4 ✓
- FetchPanel shows live balance / "syncing…" (§E) → Task 5 ✓
- Address guard, `null`-never-throw, gas caps 120k/350k, 6-dec µUSD, no migration → Global Constraints + Tasks 1/2 ✓
- Stranded-fund recovery → Task 2 (deposits whole raw balance) + deploy live-verify ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete; the one deleted line (§Task 5 step 3b) is shown explicitly.

**3. Type consistency:** `gatewayAvailableMicroUsd(address): Promise<number | null>` (Task 1) is consumed with that exact signature in Tasks 3/4. `depositOwnBalance(eoaPrivateKey): Promise<number>` (Task 2) matches the route call (Task 3). The `gatewayMicroUsd` field flows route (Tasks 3/4) → `/api/wallet` JSON → FetchPanel state + render (Task 5) under the same name. `ARC.gatewayWallet` / `ARC.usdc` / `ARC.domain` / `ARC.facilitator` all exist in `packages/core/src/chain.ts`.
