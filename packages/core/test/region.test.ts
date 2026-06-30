import { describe, it, expect } from "vitest";
import { NODE_REGION, FLY_REGION_CITY } from "../src/region";

// The node ids fixed by migrations 0001/0002/0003.
const SEEDED_NODE_IDS = [
  "tokyo-1", "frankfurt-1", "nyc-1", "singapore-1", "mumbai-1",
  "london-1", "toronto-1", "sao-paulo-1", "sydney-1",
];

describe("NODE_REGION", () => {
  it("maps every seeded node id to a non-empty Fly region", () => {
    for (const id of SEEDED_NODE_IDS) {
      expect(NODE_REGION[id], `missing region for ${id}`).toBeTruthy();
    }
  });

  it("has a display city for every region it references", () => {
    for (const region of Object.values(NODE_REGION)) {
      expect(FLY_REGION_CITY[region], `missing city for ${region}`).toBeTruthy();
    }
  });
});
