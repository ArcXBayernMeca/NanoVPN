// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorldMap } from "../components/WorldMap";

// d3-geo uses ResizeObserver — stub it in jsdom
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stub fetch so the topology load is a no-op
beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
});

const nodes = [
  { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35.6, lng: 139.6 }, pricePerGbUsd: 3 },
  { id: "fra-1", geo: { country: "Germany", city: "Frankfurt", lat: 50.1, lng: 8.6 }, pricePerGbUsd: 1.5 },
] as any;

describe("WorldMap", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <WorldMap nodes={nodes} selectedId={null} connected={false}
        streaming={null} onSelect={() => {}} />
    );
    expect(container.querySelector(".wmap")).toBeTruthy();
  });

  it("accepts all required props without type errors", () => {
    // Smoke-test: render with a selected node and connected state
    const { container } = render(
      <WorldMap nodes={nodes} selectedId="tokyo-1" connected={true}
        streaming="medium" onSelect={() => {}} />
    );
    expect(container.querySelector(".wmap")).toBeTruthy();
  });
});
