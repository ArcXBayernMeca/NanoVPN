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
