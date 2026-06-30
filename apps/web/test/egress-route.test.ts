import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { ensureProvisionedAndFunded, loadSigningKey, pay } = vi.hoisted(() => ({
  ensureProvisionedAndFunded: vi.fn(async () => ({ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, status: "funded" })),
  loadSigningKey: vi.fn(async () => "0xKEY"),
  pay: vi.fn(async () => ({ data: { status: 200, bytes: 42, egressIp: "1.2.3.4" }, amount: 1000n, transaction: "uuid-1", status: 200 })),
}));

vi.mock("@/lib/user-wallet", () => ({ ensureProvisionedAndFunded, loadSigningKey }));
vi.mock("@/lib/egress-session", () => ({ getOrCreateEgressSession: vi.fn(async () => "sess-1") }));

vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: vi.fn().mockImplementation(() => ({ pay })) }));

const insert = vi.fn(async () => ({ error: null }));
const nodeRow = { id: "tokyo-1", proxy_url: "https://node", country: "Japan", city: "Tokyo", lat: 35, lng: 139, operator_address: "0xOPERATOR" };
vi.mock("@/lib/supabase-server", () => ({
  supabaseService: () => ({
    from: (t: string) => t === "nodes"
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: nodeRow }) }) }) }
      : { insert },
  }),
}));

import { POST } from "../app/api/egress/route";
const req = (body: any, cookie?: string) =>
  new NextRequest("http://x/api/egress", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SELLER_ADDRESS = "0xSELLER";
});

describe("POST /api/egress", () => {
  it("401s when not signed in", async () => {
    expect((await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }))).status).toBe(401);
  });
  it("400s on missing url/nodeId", async () => {
    expect((await POST(req({ nodeId: "tokyo-1" }, "siwe-address=0xABC"))).status).toBe(400);
  });
  it("500s when SELLER_ADDRESS is not configured", async () => {
    delete process.env.SELLER_ADDRESS;
    const res = await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }, "siwe-address=0xABC"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "seller not configured" });
  });
  it("503s when the sponsor grant cap is reached", async () => {
    ensureProvisionedAndFunded.mockResolvedValueOnce({ eoaAddress: "0xeoa", fundedMicroUsd: 0, status: "capped" });
    const res = await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }, "siwe-address=0xABC"));
    expect(res.status).toBe(503);
    expect(pay).not.toHaveBeenCalled();
  });
  it("pays via the user's EOA, records a settlement, returns the result", async () => {
    const res = await POST(req({ nodeId: "tokyo-1", url: "https://ex.com" }, "siwe-address=0xABC"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4",
      geo: { country: "Japan", city: "Tokyo" }, transaction: "uuid-1", amountMicroUsd: 1000,
    });
    expect(pay).toHaveBeenCalledWith("https://node/egress?url=https%3A%2F%2Fex.com", { method: "POST" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "sess-1", settlement_uuid: "uuid-1", amount_micro_usd: 1000, payer: "0xeoa", payee: "0xSELLER", network: "eip155:5042002", status: "received",
    }));
  });
});
