import { describe, it, expect, vi, beforeEach } from "vitest";

const { fundSponsored } = vi.hoisted(() => ({ fundSponsored: vi.fn(async () => 100_000) }));
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
