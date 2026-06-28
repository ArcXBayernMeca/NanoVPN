# Onboarding Pilot — Plan 1: Per-user wallets + agent pays from your wallet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in (SIWE) user is provisioned their own server-custodied on-chain spending EOA, auto-funded with a sponsored testnet-USDC grant deposited into Circle Gateway, and their agent runs pay x402 from **that** wallet instead of the single shared one.

**Architecture:** New per-user `user_wallets` table (encrypted key at rest, service-role only). A web provisioning service mints + encrypts an EOA; a funding service has the sponsor wallet send native gas + USDC then the EOA self-deposits to Gateway. `/api/agent/run` is gated behind the SIWE cookie and injects the user's decrypted key into the existing `prepareRun` → `GatewayClient` path. No edge-node change.

**Tech Stack:** TypeScript/ESM, Next.js (App Router, route handlers), viem (`viem/accounts`, `viem/chains`), `@circle-fin/x402-batching/client` (`GatewayClient`), Supabase (`@supabase/supabase-js` service-role), Node `node:crypto`, vitest.

This is **Plan 1 of 3** for P1 of the spec `docs/superpowers/specs/2026-06-28-onboarding-pilot-design.md`. Plan 2 = human `/egress` interactive-fetch panel + MetaMask funding. Plan 3 = real geo regions. This plan reuses the existing single Tokyo node and the existing agent UI.

## Global Constraints

- **Testnet only.** Arc Testnet, chain id `5042002` (`ARC.network = "eip155:5042002"`). Never target mainnet.
- **USDC decimals:** ERC-20 USDC = **6 decimals** (`parseUnits(x, 6)`, `ARC.usdcDecimals`); Arc **native gas = 18 decimals** (`parseEther`). Never mix.
- **Never modify Circle EIP-712 type definitions / domain.** We only change *which private key* signs; the x402/Gateway settlement path is untouched.
- **Secrets:** `WALLET_ENCRYPTION_KEY`, `SPONSOR_PRIVATE_KEY`/`BUYER_PRIVATE_KEY` come from env only; never hardcode/commit/log. `.env*` stays gitignored.
- **Custody is custodial-by-design** for this pilot: keys are AES-256-GCM encrypted at rest, **service-role only**, browser never receives a key; each wallet holds < $1 testnet.
- **Imports (verbatim):** `import { GatewayClient } from "@circle-fin/x402-batching/client";` · `import { arcTestnet } from "viem/chains";` · `import { ARC, arcPublicClient } from "@nanovpn/core";`
- **Monorepo:** pnpm workspace, Node ≥22. Per-package tests via `vitest run`; all via `pnpm -r test`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/core/src/crypto.ts` (new) | AES-256-GCM encrypt/decrypt of a secret string with a hex master key |
| `packages/core/src/index.ts` (modify) | re-export `./crypto` |
| `supabase/migrations/0004_user_wallets.sql` (new) | `user_wallets` table + RLS (service-role only) |
| `apps/web/lib/user-wallet.ts` (new) | provision (mint+encrypt+store), load+decrypt key, mark funded |
| `apps/web/lib/funding.ts` (new) | sponsored funding: sponsor sends native gas + USDC, EOA deposits to Gateway |
| `apps/agent/src/runner.ts` (modify) | `RunParams.buyerPrivateKey?` → use it for `GatewayClient` |
| `apps/web/app/api/agent/run/route.ts` (modify) | gate on SIWE cookie; provision+fund on first run; inject user key |
| `apps/web/components/AgentRunForm.tsx` (modify) | surface the 401 "sign in first" message |
| `.env.example` (modify) | document `WALLET_ENCRYPTION_KEY`, `USER_GRANT_USD`, `USER_GAS_NATIVE`, `SPONSOR_PRIVATE_KEY` |

---

## Task 1: Core AES-256-GCM crypto helpers

**Files:**
- Create: `packages/core/src/crypto.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/crypto.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plaintext: string, keyHex: string): string` (returns `"<ivHex>:<tagHex>:<ctHex>"`) and `decryptSecret(blob: string, keyHex: string): string`. `keyHex` must be 64 hex chars (32 bytes).

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/crypto.test.ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../src/crypto";

const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"; // 32 bytes

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "0xabc123deadbeef";
    const blob = encryptSecret(secret, KEY);
    expect(blob).not.toContain(secret);
    expect(blob.split(":")).toHaveLength(3);
    expect(decryptSecret(blob, KEY)).toBe(secret);
  });

  it("fails to decrypt with the wrong key", () => {
    const blob = encryptSecret("topsecret", KEY);
    const wrong = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(blob, wrong)).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const blob = encryptSecret("topsecret", KEY);
    const [iv, tag, ct] = blob.split(":");
    const flipped = ct[0] === "a" ? "b" + ct.slice(1) : "a" + ct.slice(1);
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`, KEY)).toThrow();
  });

  it("rejects a non-32-byte key", () => {
    expect(() => encryptSecret("x", "abcd")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/core test -- crypto`
Expected: FAIL — cannot find module `../src/crypto`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/core/src/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGO = "aes-256-gcm";

function keyBuf(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes (64 hex chars)");
  return key;
}

/** Encrypt a UTF-8 secret. Returns "<ivHex>:<tagHex>:<ciphertextHex>". */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBuf(keyHex), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

/** Decrypt a blob produced by encryptSecret. Throws if the key is wrong or the data was tampered. */
export function decryptSecret(blob: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = blob.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv(ALGO, keyBuf(keyHex), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Re-export from the core barrel**

In `packages/core/src/index.ts`, add after the existing exports:

```ts
export * from "./crypto";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @nanovpn/core test`
Expected: PASS (all crypto tests green; existing core tests still green).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/crypto.ts packages/core/src/index.ts packages/core/test/crypto.test.ts
git commit -m "feat(core): AES-256-GCM encrypt/decrypt helpers for at-rest key custody"
```

---

## Task 2: `user_wallets` migration

**Files:**
- Create: `supabase/migrations/0004_user_wallets.sql`

**Interfaces:**
- Produces: table `user_wallets` with columns `user_id (pk)`, `identity_type`, `eoa_address (unique)`, `encrypted_private_key`, `funding_source`, `funded_micro_usd`, `spent_micro_usd`, `created_at`. RLS enabled, no policies (service-role only). **Not** in the realtime publication.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_user_wallets.sql
-- Per-user server-custodied spending EOA (encrypted key at rest). Service-role only.
create table if not exists user_wallets (
  user_id               text primary key,                  -- siwe address (lowercased) or passkey id
  identity_type         text not null default 'siwe',      -- 'siwe' | 'passkey'
  eoa_address           text not null unique,
  encrypted_private_key text not null,                      -- "<ivHex>:<tagHex>:<ctHex>" (AES-256-GCM)
  funding_source        text not null default 'sponsored', -- 'sponsored' | 'metamask'
  funded_micro_usd      bigint not null default 0,
  spent_micro_usd       bigint not null default 0,
  created_at            timestamptz not null default now()
);

alter table user_wallets enable row level security;
-- Intentionally NO policies: only the service role (which bypasses RLS) may read/write.
-- Intentionally NOT added to the realtime publication (no client subscriptions).
```

- [ ] **Step 2: Apply it (manual, per repo convention)**

Paste the file's contents into the Supabase SQL editor for project `qmgyechdxhpidwvbtosl` and run it. (This repo applies migrations manually — no Supabase CLI configured locally.)

- [ ] **Step 3: Verify the table exists**

In the SQL editor run: `select count(*) from user_wallets;`
Expected: returns `0` with no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_user_wallets.sql
git commit -m "feat(db): user_wallets table (per-user spending EOA, service-role only)"
```

---

## Task 3: Wallet provisioning service

**Files:**
- Create: `apps/web/lib/user-wallet.ts`
- Test: `apps/web/test/user-wallet.test.ts`
- Modify: `.env.example` (add `WALLET_ENCRYPTION_KEY`)

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` from `@nanovpn/core` (Task 1); `user_wallets` table (Task 2); `supabaseService()` from `@/lib/supabase-server`.
- Produces:
  - `getOrCreateUserWallet(userId: string): Promise<{ userId: string; eoaAddress: \`0x${string}\`; fundedMicroUsd: number }>`
  - `loadSigningKey(userId: string): Promise<\`0x${string}\`>`
  - `markFunded(userId: string, microUsd: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/user-wallet.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.WALLET_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

// In-memory fake of the one table we touch.
const rows: any[] = [];
const fakeDb = {
  from: (_t: string) => ({
    select: (_c: string) => ({
      eq: (_col: string, val: string) => ({
        maybeSingle: async () => ({ data: rows.find((r) => r.user_id === val) ?? null }),
      }),
    }),
    insert: async (row: any) => { rows.push(row); return { error: null }; },
    update: (patch: any) => ({
      eq: async (_col: string, val: string) => {
        const r = rows.find((x) => x.user_id === val);
        if (r) Object.assign(r, patch);
        return { error: null };
      },
    }),
  }),
};
vi.mock("@/lib/supabase-server", () => ({ supabaseService: () => fakeDb }));

import { getOrCreateUserWallet, loadSigningKey, markFunded } from "../lib/user-wallet";

beforeEach(() => { rows.length = 0; });

describe("user-wallet", () => {
  it("creates a wallet once and is idempotent", async () => {
    const a = await getOrCreateUserWallet("0xuser");
    expect(a.eoaAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a.fundedMicroUsd).toBe(0);
    expect(rows).toHaveLength(1);
    const b = await getOrCreateUserWallet("0xuser");
    expect(b.eoaAddress).toBe(a.eoaAddress);
    expect(rows).toHaveLength(1); // no duplicate insert
  });

  it("loadSigningKey decrypts back to a usable private key", async () => {
    await getOrCreateUserWallet("0xuser");
    const key = await loadSigningKey("0xuser");
    expect(key).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(rows[0].encrypted_private_key).not.toContain(key); // stored encrypted, not plaintext
  });

  it("markFunded updates the row", async () => {
    await getOrCreateUserWallet("0xuser");
    await markFunded("0xuser", 500_000);
    expect(rows[0].funded_micro_usd).toBe(500_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- user-wallet`
Expected: FAIL — cannot find module `../lib/user-wallet`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/user-wallet.ts
import "server-only";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encryptSecret, decryptSecret } from "@nanovpn/core";
import { supabaseService } from "@/lib/supabase-server";

function masterKey(): string {
  const k = process.env.WALLET_ENCRYPTION_KEY;
  if (!k) throw new Error("WALLET_ENCRYPTION_KEY not configured");
  return k;
}

export interface UserWallet {
  userId: string;
  eoaAddress: `0x${string}`;
  fundedMicroUsd: number;
}

/** Look up the user's spending wallet, creating + encrypting one on first call. */
export async function getOrCreateUserWallet(userId: string): Promise<UserWallet> {
  const db = supabaseService();
  const { data: existing } = await db
    .from("user_wallets")
    .select("user_id,eoa_address,funded_micro_usd")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return {
      userId: existing.user_id,
      eoaAddress: existing.eoa_address as `0x${string}`,
      fundedMicroUsd: Number(existing.funded_micro_usd),
    };
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const { error } = await db.from("user_wallets").insert({
    user_id: userId,
    identity_type: "siwe",
    eoa_address: account.address,
    encrypted_private_key: encryptSecret(pk, masterKey()),
    funding_source: "sponsored",
    funded_micro_usd: 0,
    spent_micro_usd: 0,
  });
  if (error) throw new Error(`wallet provision failed: ${error.message}`);
  return { userId, eoaAddress: account.address, fundedMicroUsd: 0 };
}

/** Decrypt and return the user's spending-EOA private key. Server-only. */
export async function loadSigningKey(userId: string): Promise<`0x${string}`> {
  const db = supabaseService();
  const { data } = await db
    .from("user_wallets")
    .select("encrypted_private_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("no wallet for user");
  return decryptSecret(data.encrypted_private_key, masterKey()) as `0x${string}`;
}

export async function markFunded(userId: string, microUsd: number): Promise<void> {
  const db = supabaseService();
  await db.from("user_wallets").update({ funded_micro_usd: microUsd }).eq("user_id", userId);
}
```

- [ ] **Step 4: Document the env var**

In `.env.example`, add under a new "Onboarding pilot" section:

```bash
# Onboarding pilot — 32-byte hex master key for encrypting per-user spending keys at rest.
# Generate with: openssl rand -hex 32
WALLET_ENCRYPTION_KEY=
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- user-wallet`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/user-wallet.ts apps/web/test/user-wallet.test.ts .env.example
git commit -m "feat(web): per-user spending-EOA provisioning (mint, encrypt, load)"
```

---

## Task 4: Sponsored funding service

**Files:**
- Create: `apps/web/lib/funding.ts`
- Test: `apps/web/test/funding.test.ts`
- Modify: `.env.example` (add `USER_GRANT_USD`, `USER_GAS_NATIVE`, `SPONSOR_PRIVATE_KEY`)

**Interfaces:**
- Consumes: `ARC`, `arcPublicClient` from `@nanovpn/core`; `GatewayClient` from `@circle-fin/x402-batching/client`; viem.
- Produces: `fundSponsored(eoaPrivateKey: \`0x${string}\`): Promise<number>` — sponsor sends native gas + USDC grant to the EOA, the EOA deposits the grant into Gateway, returns the granted amount in µUSD.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/funding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
process.env.USER_GRANT_USD = "0.50";
process.env.USER_GAS_NATIVE = "0.05";

const sendTransaction = vi.fn(async () => "0xgas");
const writeContract = vi.fn(async () => "0xgrant");
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
const deposit = vi.fn(async () => ({ depositTxHash: "0xdep" }));

vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction, writeContract }) };
});
vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ waitForTransactionReceipt }) };
});
vi.mock("@circle-fin/x402-batching/client", () => ({
  GatewayClient: vi.fn().mockImplementation(() => ({ deposit })),
}));

import { fundSponsored } from "../lib/funding";

beforeEach(() => { sendTransaction.mockClear(); writeContract.mockClear(); deposit.mockClear(); });

describe("fundSponsored", () => {
  it("sends native gas, sends the USDC grant, then deposits to Gateway", async () => {
    const granted = await fundSponsored(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    expect(sendTransaction).toHaveBeenCalledTimes(1);        // native gas
    expect(writeContract).toHaveBeenCalledTimes(1);          // ERC-20 transfer
    expect(writeContract.mock.calls[0][0]).toMatchObject({ functionName: "transfer" });
    expect(deposit).toHaveBeenCalledWith("0.50");            // EOA self-deposit
    expect(granted).toBe(500_000);                           // µUSD
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- funding`
Expected: FAIL — cannot find module `../lib/funding`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/funding.ts
import "server-only";
import { createWalletClient, http, parseUnits, parseEther, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GRANT_USD = process.env.USER_GRANT_USD ?? "0.50";       // ERC-20 USDC grant (6 dec)
const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";     // native USDC-gas (18 dec) for approve+deposit; tune via arcscan

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/**
 * Fund a freshly-minted spending EOA from the sponsor wallet, then have the EOA
 * deposit its grant into Circle Gateway (so x402 settlement can draw from it).
 * Returns the granted amount in µUSD. Caller must only invoke for unfunded wallets.
 */
export async function fundSponsored(eoaPrivateKey: Hex): Promise<number> {
  const eoa = privateKeyToAccount(eoaPrivateKey);
  const pub = arcPublicClient();
  const sponsor = createWalletClient({
    account: privateKeyToAccount(sponsorKey()),
    chain: arcTestnet,
    transport: http(ARC.rpcUrl),
  });

  // 1. native USDC-gas (18 dec) so the EOA can pay for its own approve + deposit
  const gasTx = await sponsor.sendTransaction({ to: eoa.address, value: parseEther(GAS_NATIVE) });
  await pub.waitForTransactionReceipt({ hash: gasTx });

  // 2. ERC-20 USDC grant (6 dec)
  const grantTx = await sponsor.writeContract({
    address: ARC.usdc,
    abi: erc20Abi,
    functionName: "transfer",
    args: [eoa.address, parseUnits(GRANT_USD, ARC.usdcDecimals)],
  });
  await pub.waitForTransactionReceipt({ hash: grantTx });

  // 3. the EOA deposits its grant into Gateway (deposit() does approve + deposit internally)
  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: eoaPrivateKey });
  await gateway.deposit(GRANT_USD);

  return Math.round(Number(GRANT_USD) * 1_000_000);
}
```

- [ ] **Step 4: Document the env vars**

In `.env.example`, under the "Onboarding pilot" section add:

```bash
# Sponsor wallet that funds new users' spending EOAs (falls back to BUYER_PRIVATE_KEY).
SPONSOR_PRIVATE_KEY=
# Per-user grant (ERC-20 USDC, 6 dec) and native USDC-gas (18 dec) sent to each new EOA.
USER_GRANT_USD=0.50
USER_GAS_NATIVE=0.05
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- funding`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/funding.ts apps/web/test/funding.test.ts .env.example
git commit -m "feat(web): sponsored funding — gas + USDC grant + Gateway deposit for new EOAs"
```

---

## Task 5: Inject a per-user buyer key into the agent runner

**Files:**
- Modify: `apps/agent/src/runner.ts`
- Test: `apps/agent/test/runner-per-user-key.test.ts`

**Interfaces:**
- Consumes: existing `prepareRun(params)`.
- Produces: `RunParams` gains optional `buyerPrivateKey?: string`; when present it is used for the `GatewayClient` instead of `process.env.BUYER_PRIVATE_KEY`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/agent/test/runner-per-user-key.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const ctorArgs: any[] = [];
vi.mock("@circle-fin/x402-batching/client", () => ({
  GatewayClient: vi.fn().mockImplementation((cfg: any) => { ctorArgs.push(cfg); return {}; }),
}));

// Minimal Supabase mock: one node so prepareRun proceeds, plus a no-op events insert.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [{ id: "tokyo-1", city: "Tokyo", country: "Japan", proxy_url: "http://x", price_per_request_usd: 0.001 }] }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
process.env.BUYER_PRIVATE_KEY = "0xenvkey0000000000000000000000000000000000000000000000000000000000";

import { prepareRun } from "../src/runner";

beforeEach(() => { ctorArgs.length = 0; });

describe("prepareRun buyerPrivateKey", () => {
  it("uses the per-user key when provided", async () => {
    await prepareRun({ goal: "g", budgetUsd: 0.02, mock: true, buyerPrivateKey: "0xUSERKEY" });
    expect(ctorArgs[0]).toMatchObject({ chain: "arcTestnet", privateKey: "0xUSERKEY" });
  });

  it("falls back to the env key when no per-user key is given", async () => {
    await prepareRun({ goal: "g", budgetUsd: 0.02, mock: true });
    expect(ctorArgs[0].privateKey).toBe(process.env.BUYER_PRIVATE_KEY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test -- runner-per-user-key`
Expected: FAIL — `prepareRun` ignores `buyerPrivateKey` (ctor gets the env key both times).

- [ ] **Step 3: Edit the runner**

In `apps/agent/src/runner.ts`:

Change the `RunParams` interface to add the optional field:

```ts
export interface RunParams { goal: string; budgetUsd: number; mock?: boolean; nodeId?: string; buyerPrivateKey?: string; }
```

Change the buyer-key guard (currently `if (!process.env.BUYER_PRIVATE_KEY) throw ...`) to:

```ts
  const buyerKey = params.buyerPrivateKey ?? process.env.BUYER_PRIVATE_KEY;
  if (!buyerKey) throw new Error("buyer private key not configured");
```

Change the `GatewayClient` construction (currently `privateKey: process.env.BUYER_PRIVATE_KEY as ...`) to:

```ts
  const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: buyerKey as `0x${string}` });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nanovpn/agent test`
Expected: PASS (new tests + existing runner test stay green).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/runner.ts apps/agent/test/runner-per-user-key.test.ts
git commit -m "feat(agent): prepareRun accepts a per-user buyerPrivateKey"
```

---

## Task 6: Gate `/api/agent/run` and pay from the user's wallet

**Files:**
- Modify: `apps/web/app/api/agent/run/route.ts`
- Modify: `apps/web/components/AgentRunForm.tsx`
- Test: `apps/web/test/agent-run-route.test.ts`

**Interfaces:**
- Consumes: `getOrCreateUserWallet`, `loadSigningKey`, `markFunded` (Task 3); `fundSponsored` (Task 4); `prepareRun` with `buyerPrivateKey` (Task 5); SIWE cookie `siwe-address` (existing).
- Produces: an authenticated agent-run endpoint that provisions+funds the caller's wallet on first use and runs the agent as that wallet.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/agent-run-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prepareRun = vi.fn(async () => ({ runId: "run-1", run: async () => ({ status: "succeeded", result: "ok" }) }));
const getOrCreateUserWallet = vi.fn(async () => ({ userId: "0xabc", eoaAddress: "0xeoa", fundedMicroUsd: 0 }));
const loadSigningKey = vi.fn(async () => "0xUSERKEY");
const markFunded = vi.fn(async () => {});
const fundSponsored = vi.fn(async () => 500_000);

vi.mock("@nanovpn/agent/runner", () => ({ prepareRun }));
vi.mock("@/lib/user-wallet", () => ({ getOrCreateUserWallet, loadSigningKey, markFunded }));
vi.mock("@/lib/funding", () => ({ fundSponsored }));

import { POST } from "../app/api/agent/run/route";

function req(body: any, cookie?: string) {
  return new NextRequest("http://x/api/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => { prepareRun.mockClear(); getOrCreateUserWallet.mockClear(); fundSponsored.mockClear(); });

describe("POST /api/agent/run", () => {
  it("401s when not signed in", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0.02 }));
    expect(res.status).toBe(401);
  });

  it("provisions+funds and runs as the user's wallet when signed in", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0.02 }, "siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ runId: "run-1" });
    expect(getOrCreateUserWallet).toHaveBeenCalledWith("0xabc"); // lowercased
    expect(fundSponsored).toHaveBeenCalledWith("0xUSERKEY");      // funded on first run
    expect(prepareRun).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "g", budgetUsd: 0.02, buyerPrivateKey: "0xUSERKEY" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- agent-run-route`
Expected: FAIL — current route has no auth (no 401) and never calls the wallet helpers.

- [ ] **Step 3: Rewrite the route**

```ts
// apps/web/app/api/agent/run/route.ts
import { NextRequest, NextResponse, after } from "next/server";
import { prepareRun } from "@nanovpn/agent/runner";
import { getOrCreateUserWallet, loadSigningKey, markFunded } from "@/lib/user-wallet";
import { fundSponsored } from "@/lib/funding";

export const runtime = "nodejs";

const MAX_AGENT_BUDGET_USD = Number(process.env.MAX_AGENT_BUDGET_USD) || 0.05;

export async function POST(req: NextRequest) {
  const address = req.cookies.get("siwe-address")?.value;
  if (!address) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const userId = address.toLowerCase();

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const goal = String(body?.goal ?? "").trim();
  const budgetUsd = Number(body?.budgetUsd);
  const mock = Boolean(body?.mock);
  if (!goal || !(budgetUsd > 0)) {
    return NextResponse.json({ error: "goal and budgetUsd>0 are required" }, { status: 400 });
  }
  if (budgetUsd > MAX_AGENT_BUDGET_USD) {
    return NextResponse.json({ error: `budgetUsd exceeds the max of ${MAX_AGENT_BUDGET_USD} USDC` }, { status: 400 });
  }

  try {
    const wallet = await getOrCreateUserWallet(userId);
    if (wallet.fundedMicroUsd === 0) {
      const key = await loadSigningKey(userId);
      const granted = await fundSponsored(key);
      await markFunded(userId, granted);
    }
    const buyerPrivateKey = await loadSigningKey(userId);
    const { runId, run } = await prepareRun({ goal, budgetUsd, mock, buyerPrivateKey });
    after(async () => { try { await run(); } catch (e) { console.error("[agent-run]", (e as Error).message); } });
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Surface the 401 in the form**

In `apps/web/components/AgentRunForm.tsx`, the `submit` handler already does `if (!res.ok) { setErr(data.error ?? "failed"); return; }`. Make the 401 friendly by special-casing it just before that line:

```ts
      if (res.status === 401) { setErr("Sign in with your wallet to run the agent."); return; }
      if (!res.ok) { setErr(data.error ?? "failed"); return; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- agent-run-route`
Expected: PASS (2 tests).

- [ ] **Step 6: Full typecheck/build + whole suite**

Run: `pnpm -r build && pnpm -r test`
Expected: build clean; all tests green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/agent/run/route.ts apps/web/components/AgentRunForm.tsx apps/web/test/agent-run-route.test.ts
git commit -m "feat(web): gate agent runs behind SIWE; pay from the user's provisioned wallet"
```

---

## Manual verification (after all tasks)

These need a live signer + funded sponsor and are not automated (run before relying on the demo):

1. Set `WALLET_ENCRYPTION_KEY` (`openssl rand -hex 32`) in the web env (local `.env.local` and Vercel Production). Ensure `SPONSOR_PRIVATE_KEY`/`BUYER_PRIVATE_KEY` holds testnet USDC (ERC-20) + native gas.
2. Sign in via the header wallet (SIWE). On `/agent`, run a goal with a small budget.
3. Confirm a `user_wallets` row was created for your address with a non-empty `encrypted_private_key` and `funded_micro_usd > 0`.
4. Confirm the run's payment proof (`SettlementProof` / facilitator transfer record) shows **`from` = your new EOA address**, not the shared buyer wallet — i.e. the agent paid from *your* wallet.
5. Tune `USER_GAS_NATIVE` if the EOA's `deposit()` fails for out-of-gas (check the EOA on `testnet.arcscan.app`).

## Self-review notes (addressed)

- **Spec coverage (Plan-1 slice):** per-user EOA + encryption + service-role table (Tasks 1–3); sponsored funding + Gateway deposit (Task 4); per-user signing + gated agent (Tasks 5–6). Human `/egress` panel, MetaMask funding, and real regions are explicitly **Plans 2–3**, not gaps.
- **Type consistency:** `getOrCreateUserWallet`/`loadSigningKey`/`markFunded`, `fundSponsored(eoaPrivateKey)`, and `RunParams.buyerPrivateKey` names/signatures match across Tasks 3→4→5→6.
- **No placeholders:** every step has real code/SQL/commands. `USER_GAS_NATIVE` is a concrete tunable constant with an arcscan-based tuning note (not a design TBD).
