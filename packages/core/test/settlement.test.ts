import { describe, it, expect } from "vitest";
import { settlementUrl } from "../src/settlement";
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
