import { describe, it, expect, vi } from "vitest";
import { handleEgress } from "../src/egress-endpoint";

const SELLER = "0x933a240000000000000000000000000000000000";
const publicLookup = async () => "93.184.216.34";

function fakeRes() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: "",
    writeHead(code: number, h?: Record<string, string>) { this.statusCode = code; if (h) Object.assign(this.headers, h); return this; },
    end(b?: string) { if (b) this.body = b; },
  };
}
const sig = Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64");
const okFacilitator = () => ({
  verify: vi.fn().mockResolvedValue({ isValid: true, payer: "0xpayer" }),
  settle: vi.fn().mockResolvedValue({ success: true, transaction: "uuid-1", payer: "0xpayer" }),
});

describe("handleEgress", () => {
  it("returns 402 challenge when no payment signature (no fetch)", async () => {
    const res = fakeRes();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: {} } as any, res as any,
      { facilitator: {} as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(res.statusCode).toBe(402);
    const ch = JSON.parse(Buffer.from(res.headers["PAYMENT-REQUIRED"], "base64").toString("utf8"));
    expect(ch.accepts[0].amount).toBe("1000");
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it("happy path: verify → fetch → settle, returns body and charges", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 200, bytes: 4096 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(fetchTarget).toHaveBeenCalled();
    expect(facilitator.settle).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 200, bytes: 4096, egressIp: "203.0.113.7", transaction: "uuid-1" });
  });

  it("connection failure → 502, NO settle (refund policy)", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled(); // never charged
    expect(res.statusCode).toBe(502);
  });

  it("upstream HTTP error status still counts as delivered egress → charged", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 503, bytes: 120 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.settle).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe(503);
  });

  it("settle failure after delivered egress responds 502 (transient seller-side, not 402)", async () => {
    const res = fakeRes();
    const facilitator = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: "0xpayer" }),
      settle: vi.fn().mockResolvedValue({ success: false, errorReason: "arc timeout" }),
    };
    const fetchTarget = vi.fn().mockResolvedValue({ status: 200, bytes: 512 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup },
    );
    expect(facilitator.verify).toHaveBeenCalled();
    expect(fetchTarget).toHaveBeenCalled();
    expect(facilitator.settle).toHaveBeenCalled();
    expect(res.statusCode).toBe(502); // egress delivered, settle failed seller-side — retryable
  });

  it("rejects a private target with 400 (SSRF) before any payment", async () => {
    const res = fakeRes();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=http%3A%2F%2Finternal", headers: { "payment-signature": sig } } as any, res as any,
      { facilitator: okFacilitator() as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: async () => "10.0.0.5" },
    );
    expect(res.statusCode).toBe(400);
    expect(fetchTarget).not.toHaveBeenCalled();
  });

  it("replays to the requested region when this machine is elsewhere (no payment, no fetch)", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn();
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig, "x-nanovpn-region": "fra" } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup, flyRegion: "nrt" },
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers["fly-replay"]).toBe("region=fra");
    expect(fetchTarget).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
  });

  it("processes normally and reports its region when it IS the requested region", async () => {
    const res = fakeRes();
    const facilitator = okFacilitator();
    const fetchTarget = vi.fn().mockResolvedValue({ status: 200, bytes: 4096 });
    await handleEgress(
      { url: "/egress?url=https%3A%2F%2Fexample.com", headers: { "payment-signature": sig, "x-nanovpn-region": "fra" } } as any, res as any,
      { facilitator: facilitator as any, sellerAddress: SELLER, priceMicroUsd: 1000, pricePerGbUsd: 2.5, egressIp: "203.0.113.7", fetchTarget, lookup: publicLookup, flyRegion: "fra" },
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).region).toBe("fra");
  });
});
