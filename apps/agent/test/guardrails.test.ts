import { describe, it, expect } from "vitest";
import { Guardrails } from "../src/guardrails";

describe("Guardrails", () => {
  it("allows spend within budget", () => {
    const g = new Guardrails(5000, 1000); // budget 5000µ, price 1000µ
    expect(g.canSpend()).toBe(true);
    g.record(1000);
    expect(g.spentMicroUsd).toBe(1000);
    expect(g.requestCount).toBe(1);
  });
  it("refuses the request that would exceed budget", () => {
    const g = new Guardrails(2500, 1000);
    g.record(1000); g.record(1000); // 2000 spent
    expect(g.canSpend()).toBe(false); // 2000 + 1000 = 3000 > 2500
  });
  it("enforces a max request cap independent of budget", () => {
    const g = new Guardrails(1_000_000, 1000, 2);
    g.record(1000); g.record(1000);
    expect(g.canSpend()).toBe(false); // hit 2-request cap
  });
});
