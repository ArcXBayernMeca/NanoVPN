import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.WALLET_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

// In-memory fake of the one table we touch.
const rows: any[] = [];

// Flags to force errors from fakeDb
let forceUpdateError: { message: string } | null = null;
let forceMaybeSingleError: { message: string } | null = null;

const fakeDb = {
  from: (_t: string) => ({
    select: (_c: string) => ({
      eq: (_col: string, val: string) => ({
        maybeSingle: async () => {
          if (forceMaybeSingleError) return { data: null, error: forceMaybeSingleError };
          return { data: rows.find((r) => r.user_id === val) ?? null, error: null };
        },
      }),
    }),
    insert: async (row: any) => { rows.push({ funding_status: "unfunded", ...row }); return { error: null }; },
    update: (patch: any) => ({
      eq: async (_col: string, val: string) => {
        if (forceUpdateError) return { error: forceUpdateError };
        const r = rows.find((x) => x.user_id === val);
        if (r) Object.assign(r, patch);
        return { error: null };
      },
    }),
  }),
};
vi.mock("@/lib/supabase-server", () => ({ supabaseService: () => fakeDb }));

import { getOrCreateUserWallet, loadSigningKey } from "../lib/user-wallet";

beforeEach(() => {
  rows.length = 0;
  forceUpdateError = null;
  forceMaybeSingleError = null;
});

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

  it("getOrCreateUserWallet rejects when maybeSingle returns a DB error", async () => {
    forceMaybeSingleError = { message: "boom" };
    await expect(getOrCreateUserWallet("0xuser")).rejects.toThrow("wallet lookup failed: boom");
  });

  it("enforces lowercase userId (no duplicate rows for mixed-case address)", async () => {
    const a = await getOrCreateUserWallet("0xUSER");
    const b = await getOrCreateUserWallet("0xuser");
    expect(rows).toHaveLength(1);
    expect(a.eoaAddress).toBe(b.eoaAddress);
  });

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
});
