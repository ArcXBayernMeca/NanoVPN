# Onboarding Pilot Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap sponsor spend (global grant cap + grant $0.50→$0.10) and make funding atomic (claim-once), so the now-public onboarding pilot can't be drained or double-funded.

**Architecture:** Add a `funding_status` column to `user_wallets`. Rewrite `ensureProvisionedAndFunded` to: fast-path already-funded wallets; otherwise win an atomic conditional-UPDATE claim (`unfunded`→`funding`), check the funded-wallet count against `MAX_SPONSORED_WALLETS`, fund only if under the cap, else release + report `capped`; a claim-loser polls until `funded`. Spending routes return 503 when not funded.

**Tech Stack:** Next.js route handlers (`runtime="nodejs"`, `NextRequest`), Supabase service-role client (PostgREST query builder), viem, vitest.

Implements spec `docs/superpowers/specs/2026-06-30-onboarding-pilot-hardening-design.md`. Builds on Plans 1+2 (live on `main` `f7e3328`). No edge-node change.

## Global Constraints

- **Testnet only** (Arc `eip155:5042002`); secrets from env, never logged.
- **`funding_status`** values: `'unfunded' | 'funding' | 'funded'`. The DB column default is `'unfunded'`.
- **Grant** `USER_GRANT_USD` default → **`"0.10"`** (100_000 µUSD). `USER_GAS_NATIVE` unchanged (`"0.05"`).
- **`MAX_SPONSORED_WALLETS`** default **100** (env-tunable). The cap is a **soft ceiling** (may overshoot by a few grants under concurrency — acceptable).
- **`ensureProvisionedAndFunded` return:** `{ eoaAddress: \`0x${string}\`; fundedMicroUsd: number; status: 'funded' | 'capped' | 'pending' }`.
- **Spending routes** (`/api/agent/run`, `/api/egress`) return **503** `{ error: "demo grant capacity reached — self-funding coming soon" }` when `status !== 'funded'`. `/api/wallet` returns the status as `fundingStatus` (no 503 — it's a read).
- **Existing patterns** (already in the repo — mirror them): route handlers `export const runtime = "nodejs"` + `NextRequest`; service-role client `supabaseService()`; lowercase `userId`; tests mock `@/lib/supabase-server` + `@/lib/funding`, route tests build a `NextRequest` with a `siwe-address` cookie, spies in `vi.hoisted()` to avoid Vitest TDZ.

## File structure

| File | Change |
|------|--------|
| `supabase/migrations/0005_funding_status.sql` (new) | add `funding_status` column + backfill funded rows |
| `apps/web/lib/funding.ts` (modify) | `USER_GRANT_USD` default `"0.50"`→`"0.10"` |
| `apps/web/lib/user-wallet.ts` (modify) | `getOrCreateUserWallet` returns `fundingStatus`; rewrite `ensureProvisionedAndFunded` (claim + cap + poll) |
| `apps/web/app/api/agent/run/route.ts` (modify) | 503 when not `funded` |
| `apps/web/app/api/egress/route.ts` (modify) | 503 when not `funded` |
| `apps/web/app/api/wallet/route.ts` (modify) | return `fundingStatus` |
| `.env.example` (modify) | `MAX_SPONSORED_WALLETS`; note `USER_GRANT_USD` default change |
| `apps/web/test/*` | per tasks |

---

## Task 1: Migration `0005_funding_status.sql`

**Files:**
- Create: `supabase/migrations/0005_funding_status.sql`

**Interfaces:**
- Produces: `user_wallets.funding_status text not null default 'unfunded'`, with existing funded rows backfilled to `'funded'`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_funding_status.sql
-- Atomic funding claim: 'unfunded' -> 'funding' -> 'funded'. Sponsor-cap hardening.
alter table user_wallets add column if not exists funding_status text not null default 'unfunded';
update user_wallets set funding_status = 'funded' where funded_micro_usd > 0;
```

- [ ] **Step 2: Apply it (manual, per repo convention)**

Paste the file's contents into the Supabase SQL editor for project `qmgyechdxhpidwvbtosl` and run it. (Migrations are applied manually — no CLI configured.)

- [ ] **Step 3: Verify**

In the SQL editor run: `select funding_status, count(*) from user_wallets group by funding_status;`
Expected: the 2 existing (funded) rows show `funded`; no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_funding_status.sql
git commit -m "feat(db): user_wallets.funding_status for atomic funding claim"
```

---

## Task 2: Lower the sponsored grant to $0.10 + document config

**Files:**
- Modify: `apps/web/lib/funding.ts:9`
- Modify: `apps/web/test/funding.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `fundSponsored` defaults to a $0.10 grant (100_000 µUSD) when `USER_GRANT_USD` is unset.

- [ ] **Step 1: Update the failing test first**

In `apps/web/test/funding.test.ts`, change the grant env + assertions to $0.10. Find the line setting `process.env.USER_GRANT_USD = "0.50";` and change it to:

```ts
process.env.USER_GRANT_USD = "0.10";
```
and in the test body change the deposit + return assertions:
```ts
    expect(deposit).toHaveBeenCalledWith("0.10");            // EOA self-deposit
    expect(granted).toBe(100_000);                           // µUSD
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- funding`
Expected: FAIL — implementation still returns 500_000 / deposits "0.50" via the explicit env… actually the test sets the env explicitly so it already passes; to make this a real RED, ALSO change the default and confirm. Proceed to Step 3, then Step 4 confirms GREEN. (If Step 2 shows PASS because the env is set explicitly, that's fine — the default change in Step 3 is the substantive change; Step 4 is the gate.)

- [ ] **Step 3: Change the default**

In `apps/web/lib/funding.ts` line 9, change:
```ts
const GRANT_USD = process.env.USER_GRANT_USD ?? "0.10";       // ERC-20 USDC grant (6 dec)
```

- [ ] **Step 4: Document the config**

In `.env.example`, under the "Onboarding pilot" section, update/add:
```bash
# Per-user sponsored grant (ERC-20 USDC, 6 dec). Default 0.10. Lower = more demo users per sponsor balance.
USER_GRANT_USD=0.10
# Hard cap on the number of wallets the sponsor will fund (drain protection). Capped users must self-fund.
MAX_SPONSORED_WALLETS=100
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- funding`
Expected: PASS (deposits "0.10", returns 100_000).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/funding.ts apps/web/test/funding.test.ts .env.example
git commit -m "feat(web): sponsored grant default 0.50 -> 0.10; document MAX_SPONSORED_WALLETS"
```

---

## Task 3: `getOrCreateUserWallet` returns `fundingStatus`

**Files:**
- Modify: `apps/web/lib/user-wallet.ts`
- Modify: `apps/web/test/user-wallet.test.ts`

**Interfaces:**
- Consumes: `user_wallets.funding_status` (Task 1).
- Produces: `UserWallet` interface gains `fundingStatus: string`; `getOrCreateUserWallet` selects + returns it (a freshly-inserted row is `'unfunded'`).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/user-wallet.test.ts` (inside the existing `describe`):

```ts
  it("returns fundingStatus from the row (and 'unfunded' for a new wallet)", async () => {
    const a = await getOrCreateUserWallet("0xnew");
    expect(a.fundingStatus).toBe("unfunded");
    // simulate an existing funded row, then re-read
    rows[0].funding_status = "funded";
    rows[0].funded_micro_usd = 100_000;
    const b = await getOrCreateUserWallet("0xnew");
    expect(b.fundingStatus).toBe("funded");
    expect(b.fundedMicroUsd).toBe(100_000);
  });
```
(The existing `user-wallet.test.ts` already has an in-memory `rows` array + a `fakeDb` mock and imports `getOrCreateUserWallet`. If the fake's `insert` doesn't default `funding_status`, add `funding_status: "unfunded"` to the inserted row in the fake's `insert` handler so the new wallet reads back `'unfunded'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- user-wallet`
Expected: FAIL — `fundingStatus` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/web/lib/user-wallet.ts`:

Extend the `UserWallet` interface:
```ts
export interface UserWallet {
  userId: string;
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
  fundingStatus: string;
}
```

In `getOrCreateUserWallet`, change the select to include `funding_status`:
```ts
    .select("user_id,eoa_address,funded_micro_usd,funding_status")
```
the existing-row return to include it:
```ts
    return {
      userId: existing.user_id,
      eoaAddress: existing.eoa_address as `0x${string}`,
      fundedMicroUsd: Number(existing.funded_micro_usd),
      fundingStatus: existing.funding_status as string,
    };
```
and the new-wallet return to include it (the DB default makes the persisted value `'unfunded'`):
```ts
  return { userId, eoaAddress: account.address, fundedMicroUsd: 0, fundingStatus: "unfunded" };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- user-wallet`
Expected: PASS (all user-wallet tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/user-wallet.ts apps/web/test/user-wallet.test.ts
git commit -m "feat(web): getOrCreateUserWallet returns funding_status"
```

---

## Task 4: Rewrite `ensureProvisionedAndFunded` — atomic claim + cap + poll

**Files:**
- Modify: `apps/web/lib/user-wallet.ts`
- Replace: `apps/web/test/ensure-funded.test.ts` (the old fund-once test is superseded)

**Interfaces:**
- Consumes: `getOrCreateUserWallet` (returns `fundingStatus`, Task 3); `loadSigningKey`; `fundSponsored`; `supabaseService`.
- Produces: `ensureProvisionedAndFunded(userId): Promise<{ eoaAddress: \`0x${string}\`; fundedMicroUsd: number; status: 'funded' | 'capped' | 'pending' }>`.

- [ ] **Step 1: Replace the test file**

Overwrite `apps/web/test/ensure-funded.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fundSponsored = vi.fn(async () => 100_000);
vi.mock("@/lib/funding", () => ({ fundSponsored }));

// In-memory user_wallets + a minimal PostgREST-style chainable builder.
let rows: any[] = [];
function makeDb() {
  return {
    from(_table: string) {
      const filters: [string, any][] = [];
      let patch: any = null, isUpdate = false, countMode = false;
      const match = (r: any) => filters.every(([c, v]) => r[c] === v);
      const builder: any = {
        select(_cols: string, opts?: any) { if (opts?.count) countMode = true; return builder; },
        eq(col: string, val: any) { filters.push([col, val]); return builder; },
        insert(row: any) { rows.push({ funding_status: "unfunded", funded_micro_usd: 0, spent_micro_usd: 0, ...row }); return Promise.resolve({ error: null }); },
        update(p: any) { patch = p; isUpdate = true; return builder; },
        maybeSingle() { const r = rows.find(match); return Promise.resolve({ data: r ?? null, error: null }); },
        then(resolve: any) {
          const matched = rows.filter(match);
          if (isUpdate) { matched.forEach((r) => Object.assign(r, patch)); return resolve({ data: matched.map((r) => ({ user_id: r.user_id })), error: null }); }
          if (countMode) return resolve({ count: matched.length, error: null });
          return resolve({ data: matched, error: null });
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase-server", () => ({ supabaseService: () => makeDb() }));

// Real crypto needs a key; getOrCreateUserWallet mints via viem (fine, random).
process.env.WALLET_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

import { ensureProvisionedAndFunded } from "../lib/user-wallet";

beforeEach(() => { rows = []; fundSponsored.mockClear(); process.env.MAX_SPONSORED_WALLETS = "100"; });

describe("ensureProvisionedAndFunded", () => {
  it("fast-paths an already-funded wallet (no claim, no fund)", async () => {
    rows.push({ user_id: "0xu", eoa_address: "0xeoa", encrypted_private_key: "x", funded_micro_usd: 100_000, funding_status: "funded" });
    const r = await ensureProvisionedAndFunded("0xu");
    expect(r.status).toBe("funded");
    expect(r.fundedMicroUsd).toBe(100_000);
    expect(fundSponsored).not.toHaveBeenCalled();
  });

  it("provisions + claims + funds a new wallet under the cap", async () => {
    const r = await ensureProvisionedAndFunded("0xnew");
    expect(fundSponsored).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("funded");
    expect(r.fundedMicroUsd).toBe(100_000);
    expect(rows[0].funding_status).toBe("funded");
  });

  it("refuses to fund past MAX_SPONSORED_WALLETS (releases the claim, returns capped)", async () => {
    process.env.MAX_SPONSORED_WALLETS = "1";
    rows.push({ user_id: "0xother", eoa_address: "0xo", encrypted_private_key: "x", funded_micro_usd: 100_000, funding_status: "funded" });
    const r = await ensureProvisionedAndFunded("0xnew");
    expect(fundSponsored).not.toHaveBeenCalled();
    expect(r.status).toBe("capped");
    expect(r.fundedMicroUsd).toBe(0);
    const created = rows.find((x) => x.user_id === "0xnew");
    expect(created.funding_status).toBe("unfunded"); // claim released
  });

  it("a claim-loser polls until the winner marks it funded", async () => {
    // Existing row already 'funding' (winner in flight) → our call loses the claim and polls.
    rows.push({ user_id: "0xu", eoa_address: "0xeoa", encrypted_private_key: "x", funded_micro_usd: 0, funding_status: "funding" });
    const p = ensureProvisionedAndFunded("0xu");
    // Flip to funded shortly after (simulating the winner finishing).
    setTimeout(() => { rows[0].funding_status = "funded"; rows[0].funded_micro_usd = 100_000; }, 50);
    const r = await p;
    expect(r.status).toBe("funded");
    expect(r.fundedMicroUsd).toBe(100_000);
    expect(fundSponsored).not.toHaveBeenCalled(); // loser never funds
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- ensure-funded`
Expected: FAIL — the current `ensureProvisionedAndFunded` has no `status`, no claim, no cap.

- [ ] **Step 3: Rewrite the function**

In `apps/web/lib/user-wallet.ts`, replace the entire `ensureProvisionedAndFunded` function with:

```ts
const MAX_SPONSORED_WALLETS = () => Number(process.env.MAX_SPONSORED_WALLETS) || 100;

export interface ProvisionResult {
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
  status: "funded" | "capped" | "pending";
}

/**
 * Provision + sponsor-fund a wallet, exactly once, under a global cap.
 * Atomic claim (unfunded -> funding) means only one caller funds; losers poll.
 */
export async function ensureProvisionedAndFunded(userId: string): Promise<ProvisionResult> {
  userId = userId.toLowerCase();
  const db = supabaseService();
  const wallet = await getOrCreateUserWallet(userId);
  if (wallet.fundingStatus === "funded") {
    return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: wallet.fundedMicroUsd, status: "funded" };
  }

  // Atomic claim: only the row still 'unfunded' flips to 'funding', and only one caller wins it.
  const { data: claimed } = await db
    .from("user_wallets")
    .update({ funding_status: "funding" })
    .eq("user_id", userId)
    .eq("funding_status", "unfunded")
    .select("user_id");

  if (claimed && claimed.length > 0) {
    // Cap check (soft ceiling).
    const { count } = await db
      .from("user_wallets")
      .select("user_id", { count: "exact", head: true })
      .eq("funding_status", "funded");
    if ((count ?? 0) >= MAX_SPONSORED_WALLETS()) {
      await db.from("user_wallets").update({ funding_status: "unfunded" }).eq("user_id", userId);
      return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: 0, status: "capped" };
    }
    try {
      const key = await loadSigningKey(userId);
      const granted = await fundSponsored(key);
      await db.from("user_wallets").update({ funding_status: "funded", funded_micro_usd: granted }).eq("user_id", userId);
      return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: granted, status: "funded" };
    } catch (e) {
      // Release the claim so a later attempt can retry; don't leave a stuck 'funding' row.
      await db.from("user_wallets").update({ funding_status: "unfunded" }).eq("user_id", userId);
      throw e;
    }
  }

  // Lost the claim — another caller is funding (or just finished). Poll briefly.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const w = await getOrCreateUserWallet(userId);
    if (w.fundingStatus === "funded") return { eoaAddress: w.eoaAddress, fundedMicroUsd: w.fundedMicroUsd, status: "funded" };
    if (w.fundingStatus === "unfunded") return { eoaAddress: w.eoaAddress, fundedMicroUsd: 0, status: "capped" };
  }
  return { eoaAddress: wallet.eoaAddress, fundedMicroUsd: 0, status: "pending" };
}
```
The poll-test uses a 50ms flip but the loop sleeps 1s — adjust the loop's first sleep if needed; the provided test waits for the 1s tick which is fine (the flip at 50ms is visible by the first 1s read). Keep `import { fundSponsored } from "@/lib/funding";` at the top (already present).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- ensure-funded user-wallet`
Expected: PASS (4 ensure-funded cases + user-wallet suite). The poll test takes ~1s.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/user-wallet.ts apps/web/test/ensure-funded.test.ts
git commit -m "feat(web): atomic funding claim + MAX_SPONSORED_WALLETS cap (drain protection)"
```

---

## Task 5: Callers honor the cap (503 / fundingStatus)

**Files:**
- Modify: `apps/web/app/api/agent/run/route.ts`
- Modify: `apps/web/app/api/egress/route.ts`
- Modify: `apps/web/app/api/wallet/route.ts`
- Modify: `apps/web/test/agent-run-route.test.ts`, `apps/web/test/egress-route.test.ts`, `apps/web/test/wallet-route.test.ts`

**Interfaces:**
- Consumes: `ensureProvisionedAndFunded` returning `{ ..., status }` (Task 4).
- Produces: spending routes 503 when `status !== 'funded'`; `/api/wallet` returns `fundingStatus`.

- [ ] **Step 1: Update the route tests (RED)**

`agent-run-route.test.ts`: the `ensureProvisionedAndFunded` mock currently returns `{ eoaAddress, fundedMicroUsd }`. Change it to include `status: "funded"`, and add a capped test:
```ts
// in the mock factory:
const ensureProvisionedAndFunded = vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, status: "funded" }));
// new test:
it("503s when the sponsor grant cap is reached", async () => {
  ensureProvisionedAndFunded.mockResolvedValueOnce({ eoaAddress: "0xeoa", fundedMicroUsd: 0, status: "capped" });
  const res = await POST(req({ goal: "g", budgetUsd: 0.02 }, "siwe-address=0xABC"));
  expect(res.status).toBe(503);
  expect(prepareRun).not.toHaveBeenCalled();
});
```

`egress-route.test.ts`: change the `ensureProvisionedAndFunded` mock to `{ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, status: "funded" }`, and add:
```ts
it("503s when the sponsor grant cap is reached", async () => {
  ensureProvisionedAndFunded.mockResolvedValueOnce({ eoaAddress: "0xeoa", fundedMicroUsd: 0, status: "capped" });
  const res = await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }, "siwe-address=0xABC"));
  expect(res.status).toBe(503);
  expect(pay).not.toHaveBeenCalled();
});
```

`wallet-route.test.ts`: change the `ensureProvisionedAndFunded` mock to return `status: "funded"` and assert the response includes `fundingStatus`:
```ts
const ensureProvisionedAndFunded = vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, status: "funded" }));
// in the funded test assertion:
expect(await res.json()).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 3000, fundingStatus: "funded" });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- agent-run-route egress-route wallet-route`
Expected: FAIL — routes don't 503 on capped; wallet response lacks `fundingStatus`.

- [ ] **Step 3: Update `/api/agent/run`**

In `apps/web/app/api/agent/run/route.ts`, replace `await ensureProvisionedAndFunded(userId);` (inside the try) with:
```ts
    const prov = await ensureProvisionedAndFunded(userId);
    if (prov.status !== "funded") {
      return NextResponse.json({ error: "demo grant capacity reached — self-funding coming soon" }, { status: 503 });
    }
```

- [ ] **Step 4: Update `/api/egress`**

In `apps/web/app/api/egress/route.ts`, replace `const { eoaAddress: eoa } = await ensureProvisionedAndFunded(userId);` with:
```ts
    const prov = await ensureProvisionedAndFunded(userId);
    if (prov.status !== "funded") {
      return NextResponse.json({ error: "demo grant capacity reached — self-funding coming soon" }, { status: 503 });
    }
    const eoa = prov.eoaAddress;
```

- [ ] **Step 5: Update `/api/wallet`**

In `apps/web/app/api/wallet/route.ts`, replace the final `return NextResponse.json({ ...wallet, spentMicroUsd });` with an explicit shape (don't leak `status` un-renamed):
```ts
    return NextResponse.json({
      eoaAddress: wallet.eoaAddress, fundedMicroUsd: wallet.fundedMicroUsd, spentMicroUsd, fundingStatus: wallet.status,
    });
```

- [ ] **Step 6: Run tests + full gate**

Run: `pnpm --filter web test -- agent-run-route egress-route wallet-route` then `pnpm -r build && pnpm -r test`
Expected: route tests PASS; build clean; whole suite green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/agent/run/route.ts apps/web/app/api/egress/route.ts apps/web/app/api/wallet/route.ts apps/web/test/agent-run-route.test.ts apps/web/test/egress-route.test.ts apps/web/test/wallet-route.test.ts
git commit -m "feat(web): spending routes 503 when grant-capped; /api/wallet returns fundingStatus"
```

---

## Manual verification (after all tasks)

1. Ensure migration `0005` is applied (Task 1) and `MAX_SPONSORED_WALLETS` is set on Vercel Production (optional — defaults to 100).
2. Headless (like the Plan-2 verify): a new SIWE user's first `/api/egress` still settles from their own EOA, and the `user_wallets` row ends `funding_status='funded'` with `funded_micro_usd=100000` ($0.10).
3. Cap smoke (optional, cheap): set `MAX_SPONSORED_WALLETS=2` on a local run; a 3rd new user's `/api/egress` returns **503** and their row stays `funding_status='unfunded'`, `funded_micro_usd=0`.

## Out of scope

Per-IP/time-window limiting; the FetchPanel "self-fund" UI prompt and MetaMask self-funding (Plan 2b); real geo regions (Plan 3); orphan cleanup. Edge-node untouched.

## Self-review notes (addressed)

- **Spec coverage:** migration (T1); grant $0.10 + cap env (T2); `fundingStatus` plumbing (T3); atomic claim + cap + poll (T4); 503 callers + wallet flag (T5). All spec sections mapped.
- **Type consistency:** `ensureProvisionedAndFunded` → `{ eoaAddress, fundedMicroUsd, status }` (T4) consumed by all three routes (T5); `getOrCreateUserWallet` → `fundingStatus` (T3) consumed by T4. Names align.
- **No placeholders:** every step has real SQL/code/commands. The in-memory PostgREST mock in T4 is given verbatim (the one non-obvious piece). The poll test's timing (50ms flip vs 1s loop) is called out explicitly.
