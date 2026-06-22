// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const request = vi.fn().mockResolvedValue({ status: "granted", coords: { lat: 1, lng: 2 } });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/location", () => ({ useLocation: () => ({ status: "idle", coords: null, request }) }));
vi.mock("@/components/MapBackdrop", () => ({ MapBackdrop: () => null }));

import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("requests location then navigates to /map on Start using", async () => {
    render(<LandingPage />);
    expect(screen.getByText(/pay-per-use VPN/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start using/i }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/map"));
  });
});
