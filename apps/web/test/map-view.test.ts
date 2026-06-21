import { describe, it, expect } from "vitest";
import { clampK, viewCenteredOn, MIN_K, MAX_K } from "@/lib/map-view";

describe("map-view", () => {
  it("clamps zoom to [MIN_K, MAX_K]", () => {
    expect(clampK(0.2)).toBe(MIN_K);
    expect(clampK(99)).toBe(MAX_K);
    expect(clampK(3)).toBe(3);
  });
  it("centers a projected point in the viewport", () => {
    const v = viewCenteredOn(100, 50, 400, 200, 2);
    expect(v.k).toBe(2);
    expect(v.x).toBe(400 / 2 - 100 * 2); // 0
    expect(v.y).toBe(200 / 2 - 50 * 2);  // 0
  });
});
