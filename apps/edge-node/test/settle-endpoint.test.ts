import { describe, it, expect, vi } from "vitest";
import { buildRequirements, handleSettle } from "../src/settle-endpoint";
import { SessionRegistry } from "../src/sessions";

const SELLER = "0x933a240000000000000000000000000000000000";

function fakeRes() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: "",
    writeHead(code: number, h: Record<string, string>) { this.statusCode = code; Object.assign(this.headers, h); return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(b?: string) { if (b) this.body = b; },
  };
}

describe("buildRequirements", () => {
  it("prices in atomic USDC with the Gateway EIP-712 extra", () => {
    const r = buildRequirements(10000, SELLER); // $0.01
    expect(r.amount).toBe("10000");
    expect(r.network).toBe("eip155:5042002");
    expect(r.asset).toBe("0x3600000000000000000000000000000000000000");
    expect(r.payTo).toBe(SELLER);
    expect(r.extra.name).toBe("GatewayWalletBatched");
    expect(r.extra.verifyingContract).toBe("0x0077777d7EBA4688BDeF3E311b846F25870A19B9");
  });
});

describe("handleSettle", () => {
  const registry = new SessionRegistry();
  registry.register({ id: "s1", token: "t", nodeId: "tokyo-1", pricePerGbUsd: 3, budgetMicroUsd: 1_000_000 });
  registry.addBytes("s1", 5_000_000); // 15000 µUSD unsettled

  it("returns 402 with the unsettled amount when no payment header", async () => {
    const res = fakeRes();
    await handleSettle(
      { url: "/settle?session=s1", headers: {} } as any, res as any,
      { registry, facilitator: {} as any, sellerAddress: SELLER, onSettled: vi.fn() },
    );
    expect(res.statusCode).toBe(402);
    const challenge = JSON.parse(Buffer.from(res.headers["PAYMENT-REQUIRED"], "base64").toString("utf8"));
    expect(challenge.accepts[0].amount).toBe("15000");
  });

  it("settles a paid retry and reports it via onSettled", async () => {
    const res = fakeRes();
    const onSettled = vi.fn();
    const facilitator = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: "0xpayer" }),
      settle: vi.fn().mockResolvedValue({ success: true, transaction: "uuid-123", payer: "0xpayer" }),
    };
    const payload = { x402Version: 2, payload: { signature: "0x", authorization: {} } };
    await handleSettle(
      { url: "/settle?session=s1", headers: { "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } } as any,
      res as any,
      { registry, facilitator: facilitator as any, sellerAddress: SELLER, onSettled },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(facilitator.settle).toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("s1", 15000, "uuid-123", "0xpayer");
    expect(res.statusCode).toBe(200);
  });
});
