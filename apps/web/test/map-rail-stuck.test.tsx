// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// FetchPanel hits /api/wallet on mount — stub it so jsdom doesn't throw.
vi.mock("@/components/FetchPanel", () => ({
  FetchPanel: ({ node }: any) => <div data-testid="fetch-panel">FetchPanel for {node.geo.city}</div>,
}));

// WalletPanel uses wagmi hooks — stub it.
vi.mock("@/components/WalletPanel", () => ({
  WalletPanel: () => <div data-testid="wallet-panel">WalletPanel</div>,
}));

import { MapRail } from "@/components/MapRail";

const base = {
  node: { id: "fra-1", geo: { city: "Frankfurt", country: "Germany", lat: 50.1, lng: 8.6 }, pricePerGbUsd: 2.5, pricePerRequestUsd: 0.001, operatorAddress: "", proxyUrl: "", settleUrl: "" } as any,
  signedIn: "0xabc", session: { sessionId: "sess-1" }, connecting: false,
  streaming: false, intensity: "medium" as const, copilotMsg: null,
  onConnect: () => {}, onDisconnect: () => {}, onToggleStream: () => {}, onIntensity: () => {}, onCopilot: () => {},
};

describe("MapRail connected state", () => {
  it("shows FetchPanel and Disconnect when connected", () => {
    render(<MapRail {...base} />);
    expect(screen.getByTestId("fetch-panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeTruthy();
  });

  it("does not show the old synthetic traffic controls when connected", () => {
    render(<MapRail {...base} />);
    expect(screen.queryByText(/start traffic/i)).toBeNull();
    expect(screen.queryByText(/stop traffic/i)).toBeNull();
  });
});
