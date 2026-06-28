// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapRail } from "@/components/MapRail";

vi.mock("@/components/FetchPanel", () => ({
  FetchPanel: ({ node }: any) => <button>Fetch through {node.geo.city}</button>,
}));

const base = {
  node: null, signedIn: "0xabc", session: null, connecting: false,
  streaming: false, intensity: "medium" as const, copilotMsg: null,
  onConnect: () => {}, onDisconnect: () => {}, onToggleStream: () => {},
  onIntensity: () => {}, onCopilot: () => {},
};

describe("MapRail location banner", () => {
  it("shows the banner and fires retry when location is denied", () => {
    const onRetryLocation = vi.fn();
    render(<MapRail {...base} locationDenied onRetryLocation={onRetryLocation} />);
    expect(screen.getByText(/location off/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetryLocation).toHaveBeenCalledTimes(1);
  });

  it("hides the banner after Browse is clicked", () => {
    render(<MapRail {...base} locationDenied onRetryLocation={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    expect(screen.queryByText(/location off/i)).toBeNull();
  });

  it("shows no banner when location is not denied", () => {
    render(<MapRail {...base} />);
    expect(screen.queryByText(/location off/i)).toBeNull();
  });
});

describe("MapRail locating hint", () => {
  it("shows the locating hint when locating=true and no session/node", () => {
    render(<MapRail {...base} locating />);
    expect(screen.getByText(/locating/i)).toBeTruthy();
  });

  it("does not show the locating hint when locating is falsy", () => {
    render(<MapRail {...base} />);
    expect(screen.queryByText(/locating/i)).toBeNull();
  });
});

describe("MapRail connected state", () => {
  it("renders the FetchPanel (Fetch through …) when connected", () => {
    const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerRequestUsd: 0.001 } as any;
    render(
      <MapRail node={node} signedIn={"0xabc"} session={{ sessionId: "s1" }} connecting={false}
        streaming={false} intensity={"medium"} copilotMsg={null}
        onConnect={() => {}} onDisconnect={() => {}} onToggleStream={() => {}} onIntensity={() => {}} onCopilot={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Fetch through Tokyo/i })).toBeTruthy();
  });
});
