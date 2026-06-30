import { describe, it, expect } from "vitest";
import { egressPrice } from "../src/egress-endpoint";
import { microUsdForBytes } from "@nanovpn/core";

describe("egressPrice", () => {
  it("prices per-byte when meterBytes is present", () => {
    const url = "/egress?url=https%3A%2F%2Fx&meterBytes=1000000";
    expect(egressPrice(url, 1000, 2.5)).toBe(microUsdForBytes(1_000_000, 2.5));
  });
  it("falls back to the flat price without meterBytes", () => {
    expect(egressPrice("/egress?url=https%3A%2F%2Fx", 1000, 2.5)).toBe(1000);
  });
  it("ignores a non-positive meterBytes", () => {
    expect(egressPrice("/egress?url=x&meterBytes=0", 1000, 2.5)).toBe(1000);
  });
});
