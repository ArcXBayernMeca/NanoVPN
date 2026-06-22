// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MapPage from "@/app/map/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/WorldMap", () => ({ WorldMap: () => null }));
vi.mock("@/components/MapRail", () => ({
  MapRail: (p: any) => <button onClick={p.onCopilot}>pick</button>,
}));
vi.mock("@/components/WalletProvider", () => ({
  useWallet: () => ({ signedIn: "0xabc" }),
}));
vi.mock("@/lib/traffic", () => ({ useTrafficStream: () => {} }));

const request = vi.fn().mockResolvedValue({ status: "granted", coords: { lat: 50.1, lng: 8.6 } });

vi.mock("@/lib/location", () => ({
  useLocation: () => ({ status: "granted", coords: { lat: 50.1, lng: 8.6 }, request }),
}));

describe("MapPage copilotPick", () => {
  let getCurrentPosition: ReturnType<typeof vi.fn>;
  let capturedPost: { url: string; body: unknown } | null = null;

  beforeEach(() => {
    getCurrentPosition = vi.fn();
    // @ts-expect-error partial mock
    navigator.geolocation = { getCurrentPosition };
    capturedPost = null;

    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/copilot/pick") && init?.method === "POST") {
        capturedPost = { url, body: JSON.parse(init.body as string) };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ nodeId: "fra-1", reason: "x" }),
        } as Response);
      }
      // Default: nodes fetch
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }) as typeof fetch;
  });

  afterEach(() => {
    // @ts-expect-error restore
    delete navigator.geolocation;
    vi.restoreAllMocks();
    request.mockClear();
  });

  it("calls request() from location context and sends coords to /api/copilot/pick, without touching navigator.geolocation", async () => {
    render(<MapPage />);
    fireEvent.click(screen.getByRole("button", { name: /pick/i }));

    await waitFor(() => {
      expect(capturedPost).not.toBeNull();
    });

    // (a) request() from location context was called
    expect(request).toHaveBeenCalled();

    // (b) POST body has the coords from the context
    expect(capturedPost!.body).toMatchObject({ lat: 50.1, lng: 8.6 });

    // (c) navigator.geolocation.getCurrentPosition was NOT called inline
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
