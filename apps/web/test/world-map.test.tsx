// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorldMap } from "../components/WorldMap";

vi.mock("react-simple-maps", () => ({
  ComposableMap: ({ children }: any) => <div>{children}</div>,
  Geographies: ({ children }: any) => <>{children({ geographies: [] })}</>,
  Geography: () => null,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
}));

describe("WorldMap", () => {
  it("renders a marker per node", () => {
    const nodes = [
      { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35.6, lng: 139.6 }, pricePerGbUsd: 3 },
      { id: "fra-1", geo: { country: "Germany", city: "Frankfurt", lat: 50.1, lng: 8.6 }, pricePerGbUsd: 1.5 },
    ] as any;
    render(<WorldMap nodes={nodes} selectedId={null} onSelect={() => {}} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });
});
