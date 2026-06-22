// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapRail } from "@/components/MapRail";

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
