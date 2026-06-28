import { describe, it, expect, vi, beforeEach } from "vitest";

// ── fundSponsored spy (hoisted so vi.mock factory can reference it) ───────────
const { fundSponsored } = vi.hoisted(() => ({
  fundSponsored: vi.fn(async () => 500_000),
}));

vi.mock("@/lib/funding", () => ({ fundSponsored }));

// Partial-mock our own module: keep ensureProvisionedAndFunded real, stub its deps.
// We mock supabase-server with an in-memory store so getOrCreateUserWallet /
// loadSigningKey / markFunded run without network, and verify side-effects via
// the DB rows object.
const rows: Record<string, any> = {};
const fakeDb = {
  from: (_t: string) => ({
    select: (_c: string) => ({
      eq: (_col: string, val: string) => ({
        maybeSingle: async () => ({ data: rows[val] ?? null, error: null }),
      }),
    }),
    insert: async (row: any) => { rows[row.user_id] = row; return { error: null }; },
    update: (patch: any) => ({
      eq: async (_col: string, val: string) => {
        if (rows[val]) Object.assign(rows[val], patch);
        return { error: null };
      },
    }),
  }),
};
vi.mock("@/lib/supabase-server", () => ({ supabaseService: () => fakeDb }));

// Mock @nanovpn/core: encrypt is a no-op, decrypt returns a known key
vi.mock("@nanovpn/core", () => ({
  encryptSecret: (_pk: string, _key: string) => "encrypted",
  decryptSecret: (_enc: string, _key: string) => "0xKEY",
}));

process.env.WALLET_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

import { ensureProvisionedAndFunded } from "../lib/user-wallet";

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
  fundSponsored.mockClear();
  fundSponsored.mockResolvedValue(500_000);
});

describe("ensureProvisionedAndFunded", () => {
  it("funds a brand-new wallet once", async () => {
    // Pre-provision an unfunded wallet row
    rows["0xu"] = {
      user_id: "0xu",
      eoa_address: "0xeoa",
      funded_micro_usd: 0,
      encrypted_private_key: "encrypted",
    };

    const r = await ensureProvisionedAndFunded("0xu");

    // fundSponsored called with the decrypted key
    expect(fundSponsored).toHaveBeenCalledWith("0xKEY");
    // funded_micro_usd updated in DB
    expect(rows["0xu"].funded_micro_usd).toBe(500_000);
    // return value correct
    expect(r).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 });
  });

  it("does NOT re-fund an already-funded wallet", async () => {
    // Pre-provision an already-funded wallet row
    rows["0xu"] = {
      user_id: "0xu",
      eoa_address: "0xeoa",
      funded_micro_usd: 500_000,
      encrypted_private_key: "encrypted",
    };

    const r = await ensureProvisionedAndFunded("0xu");

    expect(fundSponsored).not.toHaveBeenCalled();
    expect(r).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 });
  });
});
