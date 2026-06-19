import { describe, it, expect, vi } from "vitest";
import { TOOL_DEFS, makeExecutors } from "../src/tools";

describe("TOOL_DEFS", () => {
  it("exposes listNodes, getBalance, payRequest", () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(["getBalance", "listNodes", "payRequest"]);
  });
  it("payRequest requires a url", () => {
    const t = TOOL_DEFS.find((t) => t.name === "payRequest")!;
    expect((t.input_schema as any).required).toContain("url");
  });
});

describe("executors", () => {
  it("payRequest pays the egress endpoint and maps the result", async () => {
    const buyer = {
      pay: vi.fn().mockResolvedValue({ data: { status: 200, bytes: 2048, egressIp: "203.0.113.7" }, amount: 1000n, transaction: "uuid-9", status: 200 }),
      getBalances: vi.fn(),
    };
    const ex = makeExecutors({ nodesReader: vi.fn(), buyer: buyer as any, egressBaseUrl: "http://localhost:8080/egress" });
    const r = await ex.payRequest({ url: "https://example.com" });
    expect(buyer.pay).toHaveBeenCalledWith("http://localhost:8080/egress?url=https%3A%2F%2Fexample.com", { method: "POST" });
    expect(r).toEqual({ status: 200, bytes: 2048, egressIp: "203.0.113.7", amountMicroUsd: 1000, transaction: "uuid-9" });
  });
  it("listNodes maps DB rows to a compact shape", async () => {
    const nodesReader = vi.fn().mockResolvedValue([{ id: "tokyo-1", city: "Tokyo", country: "Japan", price_per_request_usd: 0.001 }]);
    const ex = makeExecutors({ nodesReader, buyer: {} as any, egressBaseUrl: "x" });
    expect(await ex.listNodes()).toEqual([{ id: "tokyo-1", city: "Tokyo", country: "Japan", pricePerRequestUsd: 0.001 }]);
  });
  it("getBalance returns wallet + gateway available", async () => {
    const buyer = { pay: vi.fn(), getBalances: vi.fn().mockResolvedValue({ wallet: { formatted: "39.0" }, gateway: { formattedAvailable: "0.46" } }) };
    const ex = makeExecutors({ nodesReader: vi.fn(), buyer: buyer as any, egressBaseUrl: "x" });
    expect(await ex.getBalance()).toEqual({ wallet: "39.0", gatewayAvailable: "0.46" });
  });
});
