// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { geoNaturalEarth1 } from "d3-geo";
import { pinPositions } from "@/lib/map-view";

// MapLibre GL needs WebGL, which jsdom doesn't have — stub the bits WorldMap touches.
vi.mock("maplibre-gl", () => {
  class Map {
    on() { return this; } off() { return this; } once() { return this; }
    addControl() {} remove() {} resize() {} flyTo() {} jumpTo() {} fitBounds() {}
    zoomIn() {} zoomOut() {} addSource() {} addLayer() {} setPaintProperty() {}
    getSource() { return { setData() {} }; }
    getCanvas() { return document.createElement("canvas"); }
    getZoom() { return 1; }
    dragRotate = { disable() {} };
    touchZoomRotate = { disableRotation() {} };
  }
  class Marker {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() { return this; }
    getElement() { return document.createElement("div"); }
  }
  return { default: { Map, Marker }, Map, Marker };
});

import { WorldMap } from "../components/WorldMap";

// jsdom lacks ResizeObserver
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

describe("pinPositions", () => {
  it("projects one pin per node at finite screen coords", () => {
    const projection = geoNaturalEarth1().fitExtent([[0, 0], [800, 600]], { type: "Sphere" } as any);
    const testNodes = [
      { id: "a", geo: { lat: 35.68, lng: 139.69, city: "Tokyo", country: "JP" }, pricePerGbUsd: 1, pricePerRequestUsd: 0.001, operatorAddress: "", proxyUrl: "", settleUrl: "" },
      { id: "b", geo: { lat: 19.07, lng: 72.88, city: "Mumbai", country: "IN" }, pricePerGbUsd: 1, pricePerRequestUsd: 0.001, operatorAddress: "", proxyUrl: "", settleUrl: "" },
    ] as any;
    const pins = pinPositions(testNodes, projection);
    expect(pins.map((p) => p.id)).toEqual(["a", "b"]);
    for (const p of pins) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
