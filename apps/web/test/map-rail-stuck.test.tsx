// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// SettlementLog uses supabase realtime — stub it.
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }),
  }),
}));

// Counter opens an EventSource to the node usage stream — emit one high-unsettled tick.
class MockES {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({ spentMicroUsd: 60000, totalBytes: 1000, unsettledMicroUsd: 60000 }) }), 0);
  }
  close() {}
}
beforeEach(() => { vi.stubGlobal("EventSource", MockES as any); });

import { MapRail } from "@/components/MapRail";

const base = {
  node: { id: "fra-1", geo: { city: "Frankfurt", country: "Germany", lat: 50.1, lng: 8.6 }, pricePerGbUsd: 2.5, pricePerRequestUsd: 0.001, operatorAddress: "", proxyUrl: "", settleUrl: "" } as any,
  signedIn: "0xabc", session: { sessionId: "sess-1" }, connecting: false,
  streaming: false, intensity: "medium" as const, copilotMsg: null,
  onConnect: () => {}, onDisconnect: () => {}, onToggleStream: () => {}, onIntensity: () => {}, onCopilot: () => {},
};

describe("MapRail settlement-paused warning", () => {
  it("warns when unsettled exceeds the stuck threshold", async () => {
    render(<MapRail {...base} />);
    await waitFor(() => expect(screen.getByText(/settlement paused/i)).toBeInTheDocument());
  });
});
