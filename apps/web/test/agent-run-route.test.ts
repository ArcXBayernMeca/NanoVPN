import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prepareRun, ensureProvisionedAndFunded, loadSigningKey, fundSponsored, after } = vi.hoisted(() => ({
  prepareRun: vi.fn(async () => ({ runId: "run-1", run: async () => ({ status: "succeeded", result: "ok" }) })),
  ensureProvisionedAndFunded: vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, status: "funded" })),
  loadSigningKey: vi.fn(async () => "0xUSERKEY"),
  fundSponsored: vi.fn(async () => 500_000),
  after: vi.fn((_fn: any) => { /* no-op in tests */ }),
}));

vi.mock("@nanovpn/agent/runner", () => ({ prepareRun }));
vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded, loadSigningKey }));
vi.mock("@/lib/funding", () => ({ fundSponsored }));
// `after` is a Next.js request-scope API; mock it so we can assert it was scheduled.
vi.mock("next/server", async (orig) => {
  const mod = await (orig() as any);
  return { ...mod, after };
});

import { POST } from "../app/api/agent/run/route";

function req(body: any, cookie?: string) {
  return new NextRequest("http://x/api/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  prepareRun.mockClear();
  ensureProvisionedAndFunded.mockClear();
  fundSponsored.mockClear();
  after.mockClear();
});

describe("POST /api/agent/run", () => {
  it("401s when not signed in", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0.02 }));
    expect(res.status).toBe(401);
  });

  it("provisions+funds and runs as the user's wallet when signed in", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0.02 }, "siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ runId: "run-1" });
    expect(ensureProvisionedAndFunded).toHaveBeenCalledWith("0xabc"); // lowercased
    expect(prepareRun).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "g", budgetUsd: 0.02, buyerPrivateKey: "0xUSERKEY" }),
    );
    expect(after).toHaveBeenCalledTimes(1); // deferred run is scheduled
  });

  it("400s (authed) when goal is missing", async () => {
    const res = await POST(req({ budgetUsd: 0.02 }, "siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(prepareRun).not.toHaveBeenCalled();
    expect(ensureProvisionedAndFunded).not.toHaveBeenCalled();
  });

  it("400s (authed) when goal is empty string", async () => {
    const res = await POST(req({ goal: "", budgetUsd: 0.02 }, "siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(prepareRun).not.toHaveBeenCalled();
    expect(ensureProvisionedAndFunded).not.toHaveBeenCalled();
  });

  it("400s (authed) when budgetUsd <= 0", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0 }, "siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(prepareRun).not.toHaveBeenCalled();
    expect(ensureProvisionedAndFunded).not.toHaveBeenCalled();
  });

  it("400s (authed) when budgetUsd exceeds max", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 999 }, "siwe-address=0xABC"));
    expect(res.status).toBe(400);
    expect(prepareRun).not.toHaveBeenCalled();
    expect(ensureProvisionedAndFunded).not.toHaveBeenCalled();
  });

  it("503s when the sponsor grant cap is reached", async () => {
    ensureProvisionedAndFunded.mockResolvedValueOnce({ eoaAddress: "0xeoa", fundedMicroUsd: 0, status: "capped" });
    const res = await POST(req({ goal: "g", budgetUsd: 0.02 }, "siwe-address=0xABC"));
    expect(res.status).toBe(503);
    expect(prepareRun).not.toHaveBeenCalled();
  });
});
