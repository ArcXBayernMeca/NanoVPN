import { describe, it, expect } from "vitest";
import { microUsdForBytes, shouldSettle, SETTLE_THRESHOLD_MICRO_USD, microUsdForRequest, residentialSavings, RESIDENTIAL_MARKUP } from "../src/pricing";

describe("microUsdForBytes", () => {
  it("prices 1 GB at the per-GB rate in µUSD", () => {
    // 1 GB at $2/GB = $2.00 = 2_000_000 µUSD
    expect(microUsdForBytes(1_000_000_000, 2)).toBe(2_000_000);
  });
  it("prices 1 MB at $2/GB as 2000 µUSD ($0.002)", () => {
    expect(microUsdForBytes(1_000_000, 2)).toBe(2000);
  });
  it("rounds to the nearest atomic unit", () => {
    // 1 byte at $1.5/GB = 0.0015 µUSD -> rounds to 0
    expect(microUsdForBytes(1, 1.5)).toBe(0);
    // 1_000_000 bytes at $1.5/GB = 1500 µUSD
    expect(microUsdForBytes(1_000_000, 1.5)).toBe(1500);
  });
});

describe("shouldSettle", () => {
  it("settles when accrued reaches the $0.01 threshold", () => {
    expect(shouldSettle(SETTLE_THRESHOLD_MICRO_USD, 0)).toBe(true);
    expect(shouldSettle(SETTLE_THRESHOLD_MICRO_USD - 1, 0)).toBe(false);
  });
  it("settles when ~10s elapse with any unsettled balance", () => {
    expect(shouldSettle(1, 10_000)).toBe(true);
    expect(shouldSettle(0, 10_000)).toBe(false); // nothing to settle
  });
});

describe("microUsdForRequest", () => {
  it("converts a flat USD per-request price to integer µUSD", () => {
    expect(microUsdForRequest(0.001)).toBe(1000); // $0.001 = 1000 atomic units
    expect(microUsdForRequest(0.01)).toBe(10000);
  });
  it("rounds to an integer (no fractional atomic units)", () => {
    expect(microUsdForRequest(0.0000015)).toBe(2); // 1.5 → 2
  });
});

describe("residentialSavings", () => {
  it("RESIDENTIAL_MARKUP is 5", () => {
    expect(RESIDENTIAL_MARKUP).toBe(5);
  });
  it("computes savings for a 1 MB fetch at $15/GB vs $0.001 paid", () => {
    const s = residentialSavings(1_000_000, 1000, 15); // reference = round(1e6*15/1000) = 15000 µUSD
    expect(s.referenceMicroUsd).toBe(15000);
    expect(s.savedMicroUsd).toBe(14000);
    expect(s.pct).toBe(93); // round(14000/15000*100)
  });
  it("returns zeros when there are no bytes", () => {
    expect(residentialSavings(0, 1000, 15)).toEqual({ referenceMicroUsd: 0, savedMicroUsd: 0, pct: 0 });
  });
  it("reports negative savings when the reference is below what was paid (caller clamps)", () => {
    const s = residentialSavings(500, 1000, 15); // reference = round(500*15/1000) = 8 µUSD
    expect(s.referenceMicroUsd).toBe(8);
    expect(s.savedMicroUsd).toBe(-992);
  });
});
