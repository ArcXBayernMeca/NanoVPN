import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prepareRun, getOrCreateUserWallet, loadSigningKey, markFunded, fundSponsored } = vi.hoisted(() => ({
  prepareRun: vi.fn(async () => ({ runId: "run-1", run: async () => ({ status: "succeeded", result: "ok" }) })),
  getOrCreateUserWallet: vi.fn(async () => ({ userId: "0xabc", eoaAddress: "0xeoa", fundedMicroUsd: 0 })),
  loadSigningKey: vi.fn(async () => "0xUSERKEY"),
  markFunded: vi.fn(async () => {}),
  fundSponsored: vi.fn(async () => 500_000),
}));

vi.mock("@nanovpn/agent/runner", () => ({ prepareRun }));
vi.mock("@/lib/user-wallet", () => ({ getOrCreateUserWallet, loadSigningKey, markFunded }));
vi.mock("@/lib/funding", () => ({ fundSponsored }));
// `after` is a Next.js request-scope API; suppress it in the test environment.
vi.mock("next/server", async (orig) => {
  const mod = await (orig() as any);
  return { ...mod, after: (_fn: any) => { /* no-op in tests */ } };
});

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
