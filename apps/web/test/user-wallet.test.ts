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
