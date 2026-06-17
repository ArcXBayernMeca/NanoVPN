import { describe, it, expect } from "vitest";
import { sseFrame, usageTick } from "../src/usage-sse";
import { SessionRegistry } from "../src/sessions";

describe("usage SSE", () => {
  it("formats an SSE data frame", () => {
    expect(sseFrame({ a: 1 })).toBe(`data: {"a":1}\n\n`);
  });
  it("builds a UsageTick snapshot from the registry", () => {
    const r = new SessionRegistry();
    r.register({ id: "s1", token: "t", nodeId: "n", pricePerGbUsd: 3, budgetMicroUsd: 1e9 });
    r.addBytes("s1", 1_000_000); // 3000 µUSD at $3/GB
    const tick = usageTick(r, "s1")!;
    expect(tick.totalBytes).toBe(1_000_000);
    expect(tick.spentMicroUsd).toBe(3000);
    expect(tick.unsettledMicroUsd).toBe(3000);
  });
});
