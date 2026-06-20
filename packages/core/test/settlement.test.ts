import { describe, it, expect, afterEach } from "vitest";
import { settlementUrl } from "../src/settlement";
import { fetchSettlementTxHash } from "../src/settlement";
import { ARC } from "../src/chain";

describe("settlementUrl", () => {
  it("links to the tx when a hash is present", () => {
    expect(settlementUrl({ txHash: "0xabc", address: "0xseller" })).toBe(`${ARC.explorer}/tx/0xabc`);
  });
  it("falls back to the address when there is no hash", () => {
    expect(settlementUrl({ txHash: null, address: "0xseller" })).toBe(`${ARC.explorer}/address/0xseller`);
  });
  it("falls back to the explorer root when neither is present", () => {
    expect(settlementUrl({})).toBe(ARC.explorer);
  });
});

describe("fetchSettlementTxHash", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("returns the 0x hash found anywhere in the transfer record", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: { onchain: { transactionHash: "0x" + "a".repeat(64) } } }) })) as any;
    expect(await fetchSettlementTxHash("uuid-1")).toBe("0x" + "a".repeat(64));
  });
  it("returns null when no hash is present", async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: "pending" }) })) as any;
    expect(await fetchSettlementTxHash("uuid-2")).toBeNull();
  });
  it("returns null (never throws) on network error", async () => {
    globalThis.fetch = (async () => { throw new Error("boom"); }) as any;
    expect(await fetchSettlementTxHash("uuid-3")).toBeNull();
  });
});
