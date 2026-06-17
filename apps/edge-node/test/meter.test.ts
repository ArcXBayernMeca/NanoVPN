import { describe, it, expect } from "vitest";
import { Meter } from "../src/meter";

describe("Meter", () => {
  it("accrues spend from bytes at the node's $/GB", () => {
    const m = new Meter(2); // $2/GB
    m.addBytes(1_000_000); // 1 MB -> 2000 µUSD
    expect(m.totalBytes).toBe(1_000_000);
    expect(m.spentMicroUsd).toBe(2000);
    expect(m.unsettledMicroUsd()).toBe(2000);
  });
  it("reduces unsettled when marked settled", () => {
    const m = new Meter(2);
    m.addBytes(10_000_000); // 20000 µUSD
    m.markSettled(15000);
    expect(m.settledMicroUsd).toBe(15000);
    expect(m.unsettledMicroUsd()).toBe(5000);
  });
  it("is due when unsettled crosses $0.01 or 10s pass", () => {
    const m = new Meter(2);
    m.addBytes(5_000_000); // 10000 µUSD == threshold
    expect(m.due(m.lastSettleAt)).toBe(true);
    const m2 = new Meter(2);
    m2.addBytes(100_000); // 200 µUSD (< threshold)
    expect(m2.due(m2.lastSettleAt)).toBe(false);
    expect(m2.due(m2.lastSettleAt + 10_000)).toBe(true);
  });
});
