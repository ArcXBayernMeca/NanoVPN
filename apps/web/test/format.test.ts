import { describe, it, expect } from "vitest";
import { formatUsd, formatMb } from "../components/format";

describe("formatters", () => {
  it("formats µUSD as dollars with 4 decimals", () => {
    expect(formatUsd(2000)).toBe("$0.0020");
    expect(formatUsd(1_000_000)).toBe("$1.0000");
  });
  it("formats bytes as MB", () => {
    expect(formatMb(1_000_000)).toBe("1.00 MB");
    expect(formatMb(500_000)).toBe("0.50 MB");
  });
});
