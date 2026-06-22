# Landing Page + Reliable Location Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a NordVPN-style landing page that acquires the user's location once into a shared store before dropping them onto a map zoomed to that location, fixing the AI-pick geolocation race in the process.

**Architecture:** A client-side React context (`LocationProvider`, mounted in the root layout's providers) owns location acquisition with a generous timeout, request de-duplication, and caching. The map moves from `/` to `/map`; `/` becomes a hero landing whose "Start using" button requests location then navigates. The interactive `WorldMap` gains a `userLocation` prop (initial centering + "you are here" marker); a separate non-interactive `MapBackdrop` powers the landing's animation.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (ESM), d3-geo + topojson-client (already deps), vitest + @testing-library/react (jsdom opt-in per-file).

## Global Constraints

- **No new runtime deps.** Reuse `d3-geo` + `topojson-client` already present. `react-simple-maps` is banned (React-19 peer cap).
- **Tests:** vitest. DOM tests opt into jsdom with a `// @vitest-environment jsdom` docblock at the top of the file. Run with `pnpm --filter web test`.
- **jsdom caveat:** `clientWidth`/`clientHeight` are `0`, so any d3 projection built from measured dims is `null` in tests — assert on the wrapper element or test pure helpers with a manually-constructed projection (see existing `test/world-map.test.tsx`). Stub `ResizeObserver` and `fetch` in DOM tests.
- **Theme tokens** (from `app/globals.css`): `--green #0fa968`, `--green-bright #15d687`, dark map bg `radial-gradient(130% 130% at 50% 25%, #0a1410 0%, #060d0a 70%)`, fonts `--font-display` / `--font-mono`. Match existing `.wmap`/`.btn`/`.maprail` styling.
- **Client components** that touch `navigator`/`window` must start with `"use client"` and guard `typeof navigator === "undefined"`.
- **Copy:** landing tagline = `The only pay-per-use VPN. Settled in USDC, on Arc.`

---

### Task 1: Location context (`lib/location.tsx`)

The shared store. `request()` awaits a real geolocation result (12s timeout, accepts a 10-min-old cached fix), dedupes concurrent calls, and caches a granted fix so a second call can never return a different answer. This is the actual bug fix.

**Files:**
- Create: `apps/web/lib/location.tsx`
- Modify: `apps/web/app/providers.tsx`
- Test: `apps/web/test/location.test.tsx`

**Interfaces:**
- Produces:
  - `type LocationStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable"`
  - `interface Coords { lat: number; lng: number }`
  - `interface LocationResult { status: LocationStatus; coords: Coords | null }`
  - `function LocationProvider(props: { children: React.ReactNode }): JSX.Element`
  - `function useLocation(): { status: LocationStatus; coords: Coords | null; request(): Promise<LocationResult> }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/location.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test location`
Expected: FAIL — `Cannot find module '@/lib/location'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/location.tsx`:

```tsx
"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type LocationStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable";
export interface Coords { lat: number; lng: number }
export interface LocationResult { status: LocationStatus; coords: Coords | null }

interface LocationCtx {
  status: LocationStatus;
  coords: Coords | null;
  request(): Promise<LocationResult>;
}

const Ctx = createContext<LocationCtx | null>(null);

export function useLocation(): LocationCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocation must be used within LocationProvider");
  return c;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const inflight = useRef<Promise<LocationResult> | null>(null);

  const request = useCallback((): Promise<LocationResult> => {
    if (coords) return Promise.resolve({ status: "granted", coords });
    if (inflight.current) return inflight.current;
    setStatus("prompting");
    const p = new Promise<LocationResult>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setStatus("unavailable");
        resolve({ status: "unavailable", coords: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setStatus("granted");
          resolve({ status: "granted", coords: c });
        },
        (err) => {
          const s: LocationStatus = err && err.code === 1 ? "denied" : "unavailable";
          setStatus(s);
          resolve({ status: s, coords: null });
        },
        { timeout: 12_000, maximumAge: 600_000 },
      );
    }).finally(() => { inflight.current = null; });
    inflight.current = p;
    return p;
  }, [coords]);

  return <Ctx.Provider value={{ status, coords, request }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Wire the provider into the app**

Modify `apps/web/app/providers.tsx` — wrap children with `LocationProvider` inside `WalletProvider`:

```tsx
"use client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";
import { LocationProvider } from "@/lib/location";
const qc = new QueryClient();
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <WalletProvider>
          <LocationProvider>{children}</LocationProvider>
        </WalletProvider>
        <Toaster />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test location`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/location.tsx apps/web/app/providers.tsx apps/web/test/location.test.tsx
git commit -m "feat(web): location context with dedup + reliable timeout"
```

---

### Task 2: WorldMap user-location centering + marker

Add a pure `viewForLocation` helper (unit-testable without DOM), then use it in `WorldMap` to center on the user once on arrival and render a "you are here" marker. Also originate the connection line from the user when known.

**Files:**
- Modify: `apps/web/lib/map-view.ts`
- Modify: `apps/web/components/WorldMap.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/map-view.test.ts`

**Interfaces:**
- Consumes: `viewCenteredOn`, `clampK`, `type View` (existing in `lib/map-view.ts`); `Coords` (from `lib/location`).
- Produces:
  - `function viewForLocation(loc: {lat:number;lng:number}, projection: GeoProjection, w: number, h: number, k?: number): View | null`
  - `WorldMap` new optional prop `userLocation?: { lat: number; lng: number } | null`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/map-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import { viewForLocation } from "@/lib/map-view";

const projection = geoNaturalEarth1().fitExtent([[0, 0], [800, 600]], { type: "Sphere" } as any);

describe("viewForLocation", () => {
  it("returns a view that centers the projected point in the box at the given zoom", () => {
    const loc = { lat: 50.1, lng: 8.6 }; // Frankfurt
    const v = viewForLocation(loc, projection, 800, 600, 3)!;
    const p = projection([loc.lng, loc.lat])!;
    expect(v.k).toBe(3);
    // centered: x = w/2 - px*k, y = h/2 - py*k
    expect(v.x).toBeCloseTo(400 - p[0] * 3, 5);
    expect(v.y).toBeCloseTo(300 - p[1] * 3, 5);
  });

  it("defaults to k=3", () => {
    const v = viewForLocation({ lat: 0, lng: 0 }, projection, 800, 600)!;
    expect(v.k).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test map-view`
Expected: FAIL — `viewForLocation is not a function` / not exported.

- [ ] **Step 3: Add the helper**

Append to `apps/web/lib/map-view.ts`:

```ts
/** View centered on a geo location (lat/lng) at zoom k, or null if it doesn't project. */
export function viewForLocation(
  loc: { lat: number; lng: number },
  projection: GeoProjection,
  w: number,
  h: number,
  k = 3,
): View | null {
  const p = projection([loc.lng, loc.lat]);
  return p ? viewCenteredOn(p[0], p[1], w, h, k) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test map-view`
Expected: PASS (2 tests).

- [ ] **Step 5: Use it in WorldMap + add the marker**

Replace `apps/web/components/WorldMap.tsx` with:

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import type { Intensity } from "@/lib/traffic";
import { clampK, viewCenteredOn, viewForLocation, type View, pinPositions } from "@/lib/map-view";

export function WorldMap({ nodes, selectedId, connected, streaming, onSelect, userLocation }: {
  nodes: NodeListing[]; selectedId: string | null; connected: boolean;
  streaming: Intensity | null; onSelect: (id: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [land, setLand] = useState<any[]>([]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch("/world-110m.json").then((r) => r.json())
      .then((topo) => setLand((feature(topo, topo.objects.countries) as any).features))
      .catch(() => {});
  }, []);

  const { w, h } = dims;
  const projection = useMemo(() => {
    if (!w || !h) return null;
    return geoNaturalEarth1().fitExtent([[8, 8], [w - 8, h - 8]], { type: "Sphere" } as any);
  }, [w, h]);
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pins = useMemo(() => (projection ? pinPositions(nodes, projection) : []), [nodes, projection]);

  // Pan/zoom state. Default k=1 shows the whole world; if we know the user's
  // location we recenter on it once on arrival (see the centering effect below).
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const zoomBy = (factor: number) => setView((v) => {
    const k = clampK(v.k * factor);
    const cx = w / 2, cy = h / 2; // zoom toward center
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
  });
  const onWheel = (e: React.WheelEvent) => { zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };

  // Center on the user's location once, when it first becomes available.
  const didCenterOnUser = useRef(false);
  useEffect(() => {
    if (didCenterOnUser.current || !projection || !userLocation || !w || !h) return;
    const v = viewForLocation(userLocation, projection, w, h, 3);
    if (v) { setView(v); didCenterOnUser.current = true; }
  }, [projection, userLocation, w, h]);

  // Fly-to-selection: recenter when selectedId changes
  const sel = nodes.find((n) => n.id === selectedId) ?? null;
  useEffect(() => {
    if (!projection || !sel) return;
    const p = projection([sel.geo.lng, sel.geo.lat]) as [number, number] | null;
    if (p) setView((v) => viewCenteredOn(p[0], p[1], w, h, Math.max(v.k, 2.6)));
  }, [selectedId, projection, w, h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} className="wmap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      {projection && path && (
        <svg className="wmap__svg" width={w} height={h}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {land.map((f, i) => (
              <path key={i} d={path(f) ?? ""} className="wmap__land" vectorEffect="non-scaling-stroke" />
            ))}
            {connected && sel && (() => {
              const a = projection(userLocation ? [userLocation.lng, userLocation.lat] : [0, 20]) as [number, number] | null;
              const b = projection([sel.geo.lng, sel.geo.lat]) as [number, number] | null;
              return a && b ? <line className={`wmap__link${streaming ? " is-live" : ""}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" /> : null;
            })()}
            {userLocation && (() => {
              const p = projection([userLocation.lng, userLocation.lat]) as [number, number] | null;
              return p ? (
                <g transform={`translate(${p[0]},${p[1]})`} className="wmap__me">
                  <circle className="wmap__me-halo" r={10} vectorEffect="non-scaling-stroke" />
                  <circle className="wmap__me-dot" r={4} vectorEffect="non-scaling-stroke" />
                  <title>You are here</title>
                </g>
              ) : null;
            })()}
            {pins.map(({ id, x, y }) => {
              const n = nodeById.get(id); if (!n) return null;
              const on = id === selectedId;
              return (
                <g key={id} transform={`translate(${x},${y})`}
                   className={`wmap__pin ${on ? "is-on" : ""}`} onClick={() => onSelect(id)}>
                  <circle className="wmap__halo" r={on ? 12 : 8} vectorEffect="non-scaling-stroke" />
                  <circle className="wmap__dot" r={on ? 5 : 3.5} vectorEffect="non-scaling-stroke" />
                  <title>{n.geo.city} · ${n.pricePerGbUsd}/GB</title>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <div className="wmap__zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="zoom in" onClick={() => zoomBy(1.4)}>+</button>
        <button aria-label="zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add marker CSS**

Append to `apps/web/app/globals.css` (near the other `.wmap__*` rules around line 322-330):

```css
/* user "you are here" marker */
.wmap__me-dot { fill: #cfe9ff; stroke: #ffffff; stroke-width: 1; }
.wmap__me-halo { fill: #8ec9ff; opacity: .22; animation: wmapPulse 1.8s ease-out infinite; }
```

- [ ] **Step 7: Run the full web test suite (no regressions)**

Run: `pnpm --filter web test`
Expected: PASS — existing WorldMap smoke tests still pass (the new prop is optional), plus the 2 new `viewForLocation` tests.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/map-view.ts apps/web/components/WorldMap.tsx apps/web/app/globals.css apps/web/test/map-view.test.ts
git commit -m "feat(web): WorldMap centers on user + 'you are here' marker"
```

---

### Task 3: MapBackdrop (landing animation)

A non-interactive, self-fetching world map for the landing hero background. Reuses the same projection + topology + node pins, with ambient pulsing pins. No pan/zoom, no click handlers.

**Files:**
- Create: `apps/web/components/MapBackdrop.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/map-backdrop.test.tsx`

**Interfaces:**
- Consumes: `pinPositions` (from `lib/map-view`).
- Produces: `function MapBackdrop(): JSX.Element` (renders a `.mbk` wrapper).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/map-backdrop.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MapBackdrop } from "@/components/MapBackdrop";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
beforeEach(() => { vi.stubGlobal("fetch", () => new Promise(() => {})); });

describe("MapBackdrop", () => {
  it("renders a backdrop wrapper without crashing", () => {
    const { container } = render(<MapBackdrop />);
    expect(container.querySelector(".mbk")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test map-backdrop`
Expected: FAIL — `Cannot find module '@/components/MapBackdrop'`.

- [ ] **Step 3: Implement the component**

Create `apps/web/components/MapBackdrop.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { NodeListing } from "@nanovpn/core";
import { pinPositions } from "@/lib/map-view";

/** Non-interactive world map for the landing hero. Self-fetches topology + nodes. */
export function MapBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [land, setLand] = useState<any[]>([]);
  const [nodes, setNodes] = useState<NodeListing[]>([]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    fetch("/world-110m.json").then((r) => r.json())
      .then((topo) => setLand((feature(topo, topo.objects.countries) as any).features))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

  const { w, h } = dims;
  const projection = useMemo(
    () => (w && h ? geoNaturalEarth1().fitExtent([[8, 8], [w - 8, h - 8]], { type: "Sphere" } as any) : null),
    [w, h],
  );
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const pins = useMemo(() => (projection ? pinPositions(nodes, projection) : []), [nodes, projection]);

  return (
    <div ref={wrapRef} className="mbk" aria-hidden>
      {projection && path && (
        <svg className="mbk__svg" width={w} height={h}>
          {land.map((f, i) => (
            <path key={i} d={path(f) ?? ""} className="mbk__land" vectorEffect="non-scaling-stroke" />
          ))}
          {pins.map(({ id, x, y }, i) => (
            <g key={id} transform={`translate(${x},${y})`} className="mbk__pin" style={{ animationDelay: `${(i % 6) * 0.3}s` }}>
              <circle className="mbk__halo" r={7} vectorEffect="non-scaling-stroke" />
              <circle className="mbk__dot" r={2.6} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add backdrop CSS**

Append to `apps/web/app/globals.css`:

```css
/* ---------- landing backdrop ---------- */
.mbk { position: absolute; inset: 0; background: radial-gradient(130% 130% at 50% 25%, #0a1410 0%, #060d0a 70%); overflow: hidden; }
.mbk__svg { display: block; }
.mbk__land { fill: #16241d; stroke: #2b3d33; stroke-width: 0.6; }
.mbk__dot { fill: var(--green-bright); }
.mbk__halo { fill: var(--green-bright); opacity: .14; }
.mbk__pin .mbk__halo { animation: wmapPulse 2.6s ease-out infinite; }
```

> `wmapPulse` already exists in `globals.css` (used by `.wmap__pin.is-on`). Reuse it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test map-backdrop`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/MapBackdrop.tsx apps/web/app/globals.css apps/web/test/map-backdrop.test.tsx
git commit -m "feat(web): MapBackdrop ambient world map for landing"
```

---

### Task 4: MapRail manual-pick banner

When location is denied/unavailable, the rail shows a gentle banner with **Retry** and **Browse** (dismiss). Optional props, so adding them breaks nothing for current callers.

**Files:**
- Modify: `apps/web/components/MapRail.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/map-rail.test.tsx`

**Interfaces:**
- Consumes: existing `MapRail` props.
- Produces: `MapRail` two new optional props — `locationDenied?: boolean`, `onRetryLocation?: () => void`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/map-rail.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test map-rail`
Expected: FAIL — banner text not found / props not accepted.

- [ ] **Step 3: Implement the banner**

Replace `apps/web/components/MapRail.tsx` with:

```tsx
"use client";
import { useState } from "react";
import type { NodeListing } from "@nanovpn/core";
import { Counter } from "./Counter";
import { SettlementLog } from "./SettlementLog";
import type { Intensity } from "@/lib/traffic";

export function MapRail(props: {
  node: NodeListing | null; signedIn: string | null; session: { sessionId: string } | null;
  connecting: boolean; streaming: boolean; intensity: Intensity; copilotMsg: string | null;
  locationDenied?: boolean; onRetryLocation?: () => void;
  onConnect(): void; onDisconnect(): void; onToggleStream(): void; onIntensity(i: Intensity): void; onCopilot(): void;
}) {
  const { node, signedIn, session } = props;
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const showBanner = !!props.locationDenied && !session && !bannerDismissed;
  return (
    <aside className="maprail">
      <section className="maprail__sec">
        <span className="eyebrow">Exit node</span>
        {node ? (
          <div className="node-card"><span className="node-card__pin" />
            <div><div className="node-card__name">{node.geo.city}, {node.geo.country}</div><div className="node-card__meta">{node.id}</div></div>
            <span className="node-card__rate">${node.pricePerGbUsd}/GB</span>
          </div>
        ) : <p className="hint">Spin the globe and pick a node — or let the AI choose.</p>}
        {showBanner && (
          <div className="maprail__banner">
            <p className="hint">Location off — pick a node on the map, or enable location &amp; retry.</p>
            <div className="btn--row">
              <button className="btn btn--ghost" onClick={() => props.onRetryLocation?.()}>Retry</button>
              <button className="btn btn--ghost" onClick={() => setBannerDismissed(true)}>Browse</button>
            </div>
          </div>
        )}
        {props.copilotMsg && <p className="hint copilot-msg">✦ {props.copilotMsg}</p>}
        {!session && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <button className="btn btn--primary" disabled={!node || !signedIn || props.connecting} onClick={props.onConnect}>
              {props.connecting ? "Connecting…" : node ? `Connect to ${node.geo.city}` : "Connect"}
            </button>
            <button className="btn btn--ghost copilot-btn" disabled={!signedIn} onClick={props.onCopilot}>✦ Let AI pick for me</button>
            {!signedIn && <p className="hint">Sign in with your wallet (top right) to connect.</p>}
          </div>
        )}
      </section>
      {session && node && (
        <>
          <section className="maprail__sec">
            <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} />
            <div className="stream-controls">
              <button className={`btn ${props.streaming ? "btn--ghost" : "btn--primary"}`} onClick={props.onToggleStream}>{props.streaming ? "Stop traffic" : "Start traffic"}</button>
              <div className="seg" role="group" aria-label="intensity">
                {(["light", "medium", "heavy"] as Intensity[]).map((i) => (
                  <button key={i} className="seg__btn" data-on={props.intensity === i} onClick={() => props.onIntensity(i)}>{i}</button>
                ))}
              </div>
            </div>
            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={props.onDisconnect}>Disconnect</button>
          </section>
          <section className="maprail__sec">
            <span className="eyebrow">On-chain settlements</span>
            <SettlementLog sessionId={session.sessionId} />
          </section>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Add banner CSS**

Append to `apps/web/app/globals.css`:

```css
.maprail__banner { margin-top: 10px; padding: 10px; border: 1px solid rgba(217,138,43,.4); border-radius: 10px; background: rgba(217,138,43,.08); }
.maprail__banner .btn--row { margin-top: 8px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test map-rail`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/MapRail.tsx apps/web/app/globals.css apps/web/test/map-rail.test.tsx
git commit -m "feat(web): MapRail manual-pick banner for denied location"
```

---

### Task 5: Routing cutover — landing at `/`, map at `/map`

The atomic flip. Move the map page to `/map` (wired to the location context), create the new landing at `/`, update the nav, and delete the now-unused `use-user-location.ts`. Routing must change together so there is never a broken `/`.

**Files:**
- Create: `apps/web/app/map/page.tsx` (via `git mv` from `app/page.tsx`, then edit)
- Create: `apps/web/app/page.tsx` (new landing)
- Modify: `apps/web/components/SiteNav.tsx`
- Delete: `apps/web/lib/use-user-location.ts` (no importers — verified)
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/landing.test.tsx`

**Interfaces:**
- Consumes: `useLocation` (Task 1), `MapBackdrop` (Task 3), `WorldMap` `userLocation` prop (Task 2), `MapRail` `locationDenied`/`onRetryLocation` (Task 4), `useRouter` from `next/navigation`.

- [ ] **Step 1: Move the map page to `/map`**

```bash
mkdir -p apps/web/app/map
git mv apps/web/app/page.tsx apps/web/app/map/page.tsx
```

- [ ] **Step 2: Wire the map page to the location context**

Replace the contents of `apps/web/app/map/page.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { WorldMap } from "@/components/WorldMap";
import { MapRail } from "@/components/MapRail";
import { useTrafficStream, type Intensity } from "@/lib/traffic";
import { useWallet } from "@/components/WalletProvider";
import { useLocation } from "@/lib/location";
import type { NodeListing } from "@nanovpn/core";

export default function MapPage() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { signedIn } = useWallet();
  const { coords, status, request } = useLocation();
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [copilotMsg, setCopilotMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

  // Deep-link straight to /map without visiting the landing: acquire location now.
  useEffect(() => {
    if (status === "idle") void request();
  }, [status, request]);

  const node = nodes.find((n) => n.id === selected) ?? null;
  useTrafficStream(session?.sessionId ?? null, intensity, streaming);

  async function connect() {
    if (!selected || !signedIn) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: selected, budgetUsd: 1 }),
      });
      const data = (await res.json()) as { sessionId?: string };
      if (data.sessionId) setSession({ sessionId: data.sessionId });
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    if (!session) return;
    setStreaming(false);
    await fetch(`/api/session?id=${session.sessionId}`, { method: "DELETE" }).catch(() => {});
    setSession(null);
  }

  async function copilotPick() {
    setCopilotMsg("Asking the AI to choose…");
    const loc = (await request()).coords;
    const res = await fetch("/api/copilot/pick", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loc ?? {}),
    }).then((r) => r.json()).catch(() => null);
    if (res?.nodeId) { setSelected(res.nodeId); setCopilotMsg(res.reason ?? null); }
    else setCopilotMsg("Couldn't pick automatically — choose a node on the map.");
  }

  return (
    <div className="map-stage">
      <div className="map-globe">
        <WorldMap nodes={nodes} selectedId={selected} connected={!!session}
          userLocation={coords}
          streaming={streaming ? intensity : null} onSelect={(id) => { if (!session) setSelected(id); }} />
      </div>
      <MapRail node={node} signedIn={signedIn} session={session} connecting={connecting}
        streaming={streaming} intensity={intensity} copilotMsg={copilotMsg}
        locationDenied={status === "denied" || status === "unavailable"}
        onRetryLocation={() => void request()}
        onConnect={connect} onDisconnect={disconnect} onToggleStream={() => setStreaming((s) => !s)}
        onIntensity={setIntensity} onCopilot={copilotPick} />
    </div>
  );
}
```

- [ ] **Step 3: Create the landing page**

Create `apps/web/app/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapBackdrop } from "@/components/MapBackdrop";
import { useLocation } from "@/lib/location";

export default function LandingPage() {
  const router = useRouter();
  const { request } = useLocation();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    // Acquire location, but never let a stuck prompt block navigation (~6s cap).
    const cap = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    await Promise.race([request().then(() => undefined), cap]);
    router.push("/map");
  }

  return (
    <main className="landing">
      <div className="landing__bg"><MapBackdrop /></div>
      <section className="landing__hero">
        <h1 className="landing__title">Nano<b>VPN</b></h1>
        <p className="landing__tag">The only pay-per-use VPN. Settled in USDC, on Arc.</p>
        <button className="btn btn--primary landing__cta" onClick={start} disabled={busy}>
          {busy ? "Locating…" : "Start using"}
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Update the nav**

In `apps/web/components/SiteNav.tsx`, change the "Map" link target from `/` to `/map`:

```tsx
<Link href="/map">Map</Link>
```

(Leave the brand `<Link href="/">` pointing at the landing.)

- [ ] **Step 5: Delete the dead hook**

```bash
git rm apps/web/lib/use-user-location.ts
```

- [ ] **Step 6: Add landing CSS**

Append to `apps/web/app/globals.css`:

```css
/* ---------- landing ---------- */
.landing { position: relative; height: calc(100vh - var(--nav-h, 56px)); width: 100%; overflow: hidden; display: grid; place-items: center; }
.landing__bg { position: absolute; inset: 0; }
.landing__bg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 50%, rgba(6,13,10,0) 30%, rgba(6,13,10,.85) 100%); }
.landing__hero { position: relative; z-index: 1; text-align: center; padding: 0 24px; animation: landingIn .7s ease-out both; }
.landing__title { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.04em; font-size: clamp(44px, 9vw, 104px); color: #f1f7f4; margin: 0; }
.landing__title b { color: var(--green-bright); }
.landing__tag { font-size: clamp(15px, 2.4vw, 20px); color: rgba(234,242,238,.78); margin: 14px 0 30px; }
.landing__cta { width: auto; padding: 14px 34px; font-size: 16px; border-radius: 12px; box-shadow: 0 10px 40px rgba(21,214,135,.35); }
@keyframes landingIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 7: Write the landing test**

Create `apps/web/test/landing.test.tsx`:

```tsx
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
```

- [ ] **Step 8: Run the full web suite**

Run: `pnpm --filter web test`
Expected: PASS — all suites including the new `landing` test.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/map/page.tsx apps/web/app/page.tsx apps/web/components/SiteNav.tsx apps/web/app/globals.css apps/web/test/landing.test.tsx
git commit -m "feat(web): landing at /, map at /map, location-wired"
```

---

### Task 6: Full verification

End-to-end confirmation across the monorepo before handing off.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + build the whole workspace**

Run: `pnpm -r build`
Expected: clean (no TS errors). Confirm `apps/web` builds with routes `/` and `/map`.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm -r test`
Expected: all pass (prior count + the new tests from Tasks 1–5).

- [ ] **Step 3: Manual smoke (dev server)**

```bash
pnpm --filter web dev
```
Then in the browser (note: location only works over https or on localhost):
- [ ] `/` shows the animated landing + "Start using".
- [ ] Click "Start using" → browser prompts for location → approve → lands on `/map` zoomed to your area with a "You are here" marker. **No re-click needed.**
- [ ] On `/map`, click "✦ Let AI pick for me" → picks a *nearby* node on the **first** click (Frankfurt-class proximity, not the cheapest fallback).
- [ ] Deny location (or use a fresh profile and dismiss) → `/map` shows whole-world view + the rail's "Location off" banner; **Retry** re-prompts, **Browse** dismisses.
- [ ] Nav "Map" link goes to `/map`; brand goes to `/`.

> If CSS edits don't appear in dev: `rm -rf apps/web/.next` (Turbopack stale-chunk).

- [ ] **Step 4: Final commit (if any manual fixes were needed)**

```bash
git add -A && git commit -m "chore(web): verification fixes for landing + location"
```

---

## Self-Review

**Spec coverage:**
- Routing (`/` landing, `/map` app, nav update) → Task 5. ✓
- Location store with 12s timeout / dedup / cache / SSR guard → Task 1. ✓
- Landing hero + MapBackdrop + Start-using→request→push (6s cap) → Tasks 3, 5. ✓
- Map arrival centering (k≈3) + "you are here" → Task 2. ✓
- AI-pick reads context coords (bug fix, no inline getCurrentPosition) → Task 5 (`copilotPick`). ✓
- Denied/unavailable manual-pick banner (Retry + Browse) → Task 4. ✓
- Deep-link `/map` requests on mount → Task 5 (effect on `status === "idle"`). ✓
- Remove `use-user-location.ts` → Task 5. ✓
- Tests for state machine, centering math, copilot-via-context, Start-using nav → Tasks 1, 2, 4, 5. ✓
- Error handling table (missing geo, denial, timeout, concurrent, SSR, stuck prompt) → Task 1 impl + Task 5 cap. ✓

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `LocationStatus`/`Coords`/`LocationResult` defined in Task 1 and consumed unchanged in Tasks 5; `viewForLocation` signature defined in Task 2 and used in the same task's `WorldMap`; `userLocation` prop name consistent across `WorldMap` (Task 2) and map page (Task 5); `locationDenied`/`onRetryLocation` consistent across `MapRail` (Task 4) and map page (Task 5). ✓

**Note on the bug fix mechanism:** the original failure was `getCurrentPosition({timeout:4000})` resolving `null` before the prompt was answered. The new `request()` uses a 12s timeout *and* the landing acquires location before the map mounts, so by the time `copilotPick` runs the coords are already cached — the first click is accurate.
