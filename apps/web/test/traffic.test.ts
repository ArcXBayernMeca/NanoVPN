import { describe, it, expect } from "vitest";
import { intervalForIntensity } from "@/lib/traffic";

describe("intervalForIntensity", () => {
  it("maps intensity to a pull interval (ms), heavier = shorter", () => {
    expect(intervalForIntensity("light")).toBe(3000);
    expect(intervalForIntensity("medium")).toBe(1200);
    expect(intervalForIntensity("heavy")).toBe(400);
  });
  it("is monotonic: light > medium > heavy", () => {
    expect(intervalForIntensity("light")).toBeGreaterThan(intervalForIntensity("medium"));
    expect(intervalForIntensity("medium")).toBeGreaterThan(intervalForIntensity("heavy"));
  });
});
