import { describe, it, expect } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import { clampK, viewCenteredOn, MIN_K, MAX_K, viewForLocation } from "@/lib/map-view";

const projection = geoNaturalEarth1().fitExtent([[0, 0], [800, 600]], { type: "Sphere" } as any);

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

describe("viewForLocation", () => {
  it("returns a view that centers the projected point in the box at the given zoom", () => {
    const loc = { lat: 50.1, lng: 8.6 }; // Frankfurt
    const v = viewForLocation(loc, projection, 800, 600, 3)!;
    const p = projection([loc.lng, loc.lat])!;
    expect(v.k).toBe(3);
    // centered: x = w/2 - px*k, y = h/2 - py*k
    expect(v.x).toBeCloseTo(400 - p[0] * 3, 5);
    expect(v.y).toBeCloseTo(300 - p[1] * 3, 5);
  });

  it("defaults to k=3", () => {
    const v = viewForLocation({ lat: 0, lng: 0 }, projection, 800, 600)!;
    expect(v.k).toBe(3);
  });
});
