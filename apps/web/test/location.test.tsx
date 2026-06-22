// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LocationProvider, useLocation } from "@/lib/location";

function Probe() {
  const { status, coords, request } = useLocation();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="coords">{coords ? `${coords.lat},${coords.lng}` : "none"}</span>
      <button onClick={() => void request()}>req</button>
    </div>
  );
}

function mockGeo(impl: (ok: PositionCallback, err: PositionErrorCallback) => void) {
  // @ts-expect-error partial mock
  navigator.geolocation = { getCurrentPosition: vi.fn(impl) };
  return (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>);
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { delete (navigator as any).geolocation; });

describe("LocationProvider", () => {
  it("resolves granted with coords on success", async () => {
    mockGeo((ok) => ok({ coords: { latitude: 50.1, longitude: 8.6 } } as GeolocationPosition));
    render(<LocationProvider><Probe /></LocationProvider>);
    await act(async () => { screen.getByText("req").click(); });
    expect(screen.getByTestId("status").textContent).toBe("granted");
    expect(screen.getByTestId("coords").textContent).toBe("50.1,8.6");
  });

  it("resolves denied when permission is refused", async () => {
    mockGeo((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    render(<LocationProvider><Probe /></LocationProvider>);
    await act(async () => { screen.getByText("req").click(); });
    expect(screen.getByTestId("status").textContent).toBe("denied");
  });

  it("dedupes concurrent requests into one getCurrentPosition call", async () => {
    const saved: PositionCallback[] = [];
    const spy = mockGeo((ok) => { saved.push(ok); });
    let api!: ReturnType<typeof useLocation>;
    function Grab() { api = useLocation(); return null; }
    render(<LocationProvider><Grab /></LocationProvider>);
    await act(async () => {
      const p1 = api.request(); const p2 = api.request();
      saved[0]({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
      await Promise.all([p1, p2]);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when geolocation is missing", async () => {
    // @ts-expect-error force-missing
    navigator.geolocation = undefined;
    render(<LocationProvider><Probe /></LocationProvider>);
    await act(async () => { screen.getByText("req").click(); });
    expect(screen.getByTestId("status").textContent).toBe("unavailable");
  });
});
