import { describe, it, expect, vi } from "vitest";
import { makeExecutors, TOOL_DEFS } from "../src/tools";

const NODES = [
  { id: "tokyo-1", city: "Tokyo", country: "JP", proxy_url: "http://tokyo:8080", price_per_request_usd: 0.001 },
  { id: "mumbai-1", city: "Mumbai", country: "IN", proxy_url: "http://mumbai:8080", price_per_request_usd: 0.0007 },
];

function fakeBuyer() {
  const calls: string[] = [];
  const opts: any[] = [];
  return {
    calls,
    opts,
    async pay<T>(url: string, o?: any) { calls.push(url); opts.push(o); return { data: { status: 200, bytes: 1024, egressIp: "1.2.3.4" } as T, amount: 700n, transaction: "tx-1", status: 200 }; },
    async getBalances() { return { wallet: { formatted: "10" }, gateway: { formattedAvailable: "5" } }; },
  };
}

describe("TOOL_DEFS", () => {
  it("exposes listNodes, getBalance, payRequest", () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(["getBalance", "listNodes", "payRequest"]);
  });
  it("payRequest requires a url", () => {
    const t = TOOL_DEFS.find((t) => t.name === "payRequest")!;
    expect((t.input_schema as any).required).toContain("url");
  });
});

describe("payRequest is node-aware", () => {
  it("routes to the chosen node's /egress and echoes nodeId", async () => {
    const buyer = fakeBuyer();
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: buyer as any });
    const r = await ex.payRequest({ nodeId: "mumbai-1", url: "https://x.test/a" });
    expect(buyer.calls[0]).toContain("http://mumbai:8080/egress?url=");
    expect(r.nodeId).toBe("mumbai-1");
    expect(r.amountMicroUsd).toBe(700);
  });
  it("throws on an unknown node", async () => {
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: fakeBuyer() as any });
    await expect(ex.payRequest({ nodeId: "nope", url: "https://x.test/a" })).rejects.toThrow(/unknown node/);
  });
  it("declares nodeId required on the payRequest tool", () => {
    const pay = TOOL_DEFS.find((t) => t.name === "payRequest")!;
    expect(pay.input_schema.required).toEqual(expect.arrayContaining(["nodeId", "url"]));
  });
  it("pins egress to the chosen node's Fly region via headers", async () => {
    const buyer = fakeBuyer();
    const ex = makeExecutors({ nodesReader: async () => NODES, buyer: buyer as any });
    await ex.payRequest({ nodeId: "mumbai-1", url: "https://x.test/a" });
    expect(buyer.opts[0].headers).toMatchObject({ "fly-prefer-region": "bom", "x-nanovpn-region": "bom" });
  });
});

describe("executors", () => {
  it("listNodes maps DB rows to a compact shape", async () => {
    const nodesReader = vi.fn().mockResolvedValue([{ id: "tokyo-1", city: "Tokyo", country: "Japan", proxy_url: "http://t:8080", price_per_request_usd: 0.001 }]);
    const ex = makeExecutors({ nodesReader, buyer: {} as any });
    expect(await ex.listNodes()).toEqual([{ id: "tokyo-1", city: "Tokyo", country: "Japan", pricePerRequestUsd: 0.001 }]);
  });
  it("getBalance returns wallet + gateway available", async () => {
    const buyer = { pay: vi.fn(), getBalances: vi.fn().mockResolvedValue({ wallet: { formatted: "39.0" }, gateway: { formattedAvailable: "0.46" } }) };
    const ex = makeExecutors({ nodesReader: vi.fn(), buyer: buyer as any });
    expect(await ex.getBalance()).toEqual({ wallet: "39.0", gatewayAvailable: "0.46" });
  });
});
