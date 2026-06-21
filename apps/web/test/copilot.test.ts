import { describe, it, expect } from "vitest";
import { pickNodeDeterministic } from "@/lib/copilot";

const N = (id: string, lat: number, lng: number, gb: number): any => ({ id, geo: { lat, lng, city: id, country: "" }, pricePerGbUsd: gb, pricePerRequestUsd: gb / 1000 });
const nodes = [N("tokyo-1", 35.7, 139.7, 1.8), N("london-1", 51.5, -0.1, 2.2), N("nyc-1", 40.7, -74, 2.4)];

describe("pickNodeDeterministic", () => {
  it("picks the nearest node to the user", () => {
    expect(pickNodeDeterministic({ lat: 48.9, lng: 2.3 }, nodes).nodeId).toBe("london-1"); // Paris → London
  });
  it("falls back to cheapest $/GB when location is unknown", () => {
    expect(pickNodeDeterministic(null, nodes).nodeId).toBe("tokyo-1");
  });
});
