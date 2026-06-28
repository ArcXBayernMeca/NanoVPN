import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { ensureProvisionedAndFunded } = vi.hoisted(() => ({
  ensureProvisionedAndFunded: vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000 })),
}));
vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded }));
const rows = [{ amount_micro_usd: 1000 }, { amount_micro_usd: 2000 }];
vi.mock("@/lib/supabase-server", () => ({
  supabaseService: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows }) }) }) }),
}));

import { GET } from "../app/api/wallet/route";
const req = (cookie?: string) =>
  new NextRequest("http://x/api/wallet", { headers: cookie ? { cookie } : {} });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/wallet", () => {
  it("401s when not signed in", async () => {
    expect((await GET(req())).status).toBe(401);
  });
  it("returns the funded wallet + summed spend", async () => {
    const res = await GET(req("siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 3000 });
    expect(ensureProvisionedAndFunded).toHaveBeenCalledWith("0xabc");
  });
});
