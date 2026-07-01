import { describe, it, expect, vi, beforeEach } from "vitest";
import { gatewayAvailableMicroUsd } from "../lib/gateway-balance";

const ADDR = "0x1B09Af2b2F079CCd8b0caC0252338e3A2089661C";

beforeEach(() => vi.restoreAllMocks());

describe("gatewayAvailableMicroUsd", () => {
  it("returns null for a malformed address without calling the API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await gatewayAvailableMicroUsd("not-an-address")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses the decimal available balance into integer µUSD", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ balances: [{ balance: "0.081935" }] }), { status: 200 }),
    );
    expect(await gatewayAvailableMicroUsd(ADDR)).toBe(81935);
  });

  it("returns null on a non-OK response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 502 }));
    expect(await gatewayAvailableMicroUsd(ADDR)).toBeNull();
  });
});
