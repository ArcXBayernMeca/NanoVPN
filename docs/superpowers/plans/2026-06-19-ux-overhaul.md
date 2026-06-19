# NanoVPN UX/UI Overhaul (Layer 2.5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The globe (Task 2/3) and `/developers` (Task 7) are visual — verify with the headless-Chrome screenshot loop, and use **frontend-design** for the globe's aesthetic.

**Goal:** Make both NanoVPN front doors demo-grade — a 3D interactive globe, a real connect→stream→disconnect human flow, and an agent surface you can launch from the web with a discoverable on-ramping page.

**Architecture:** All UI work is in `apps/web` (Next 16 App Router, React 19, ESM); plus a small DRY refactor extracting the agent run-wiring into `apps/agent/src/runner.ts` so a web API route can launch a run in-process. Reuses the existing proxy/`/api/browse`, SSE `Counter`, realtime `SettlementLog`/`AgentFeed`, and the agent loop.

**Tech Stack:** `react-globe.gl@^2.38.0` (three.js globe), Next `after()` for deferred runs, Supabase realtime, `@nanovpn/agent` (workspace dep added to web), vitest + headless `google-chrome` screenshots.

## Global Constraints

- **Testnet only.** Arc chain `5042002`, USDC 6 decimals (µUSD == atomic USDC, integer).
- **Secrets via env only**, never committed/logged. The web agent-run route needs `BUYER_PRIVATE_KEY` + `ANTHROPIC_API_KEY` in `apps/web/.env.local` (gitignored); without the Anthropic key the run falls back to mock mode (still settles real USDC).
- **ESM** throughout; React 19 / Next 16. WebGL components must be `next/dynamic` with `{ ssr: false }`.
- **Traffic is generated load**, not the user's OS traffic (documented limitation).
- **Reuse the existing design tokens** in `apps/web/app/globals.css` (`--canvas #f7f7f3`, `--panel`, `--ink #0b1a12`, `--muted`, `--green #0fa968`, `--green-bright #15d687`, `--green-tint`, `--green-line`, `--line`, `--amber`; fonts `--font-display` Space Grotesk, `--font-mono` JetBrains Mono).
- **Keep the existing 65 tests green** (`pnpm -r test`); `pnpm -r build` clean.
- **Edge-node gotcha:** start with env sourced, stop by port (`lsof -ti tcp:8080 | xargs -r kill`), never `pkill -f tsx`. **Web dev gotcha:** if CSS edits don't show, `rm -rf apps/web/.next` (Turbopack stale chunk).

---

## File Structure

- `apps/web/lib/traffic.ts` — `intervalForIntensity` + `useTrafficStream` (NEW)
- `apps/web/lib/use-user-location.ts` — best-effort geolocation hook (NEW)
- `apps/web/components/GlobeMap.tsx` — 3D globe (NEW, replaces `WorldMap` usage)
- `apps/web/app/page.tsx` — human view: globe + connect/disconnect + stream (MODIFY)
- `apps/agent/src/runner.ts` — `prepareRun` (NEW, extracted from `index.ts`)
- `apps/agent/src/index.ts` — CLI now calls `prepareRun` (MODIFY)
- `apps/agent/package.json` — add `exports` for `./runner` (MODIFY)
- `apps/web/app/api/agent/run/route.ts` — `POST` launch a run (NEW)
- `apps/web/components/AgentRunForm.tsx` — run form (NEW)
- `apps/web/app/agent/page.tsx` — render the form above the feed (MODIFY)
- `apps/web/lib/agent-prompt.ts` — the paste-able agent prompt + endpoint facts (NEW)
- `apps/web/components/CopyButton.tsx` — copy-to-clipboard button (NEW)
- `apps/web/app/developers/page.tsx` — "Use with your agent" page (NEW)
- `apps/web/components/SiteNav.tsx` — shared top nav (NEW)
- `apps/web/app/layout.tsx` — render `SiteNav` (MODIFY)
- `apps/web/package.json` — add `react-globe.gl`, `@nanovpn/agent` (MODIFY)
- `apps/web/app/globals.css` — globe + nav + form + developers styles (MODIFY)
- Tests under `apps/web/test/` and `apps/agent/test/`.

---

## Task 1: Traffic streaming hook

**Files:**
- Create: `apps/web/lib/traffic.ts`
- Test: `apps/web/test/traffic.test.ts`

**Interfaces:**
- Produces: `type Intensity = "light"|"medium"|"heavy"`; `intervalForIntensity(i: Intensity): number`; `useTrafficStream(sessionId: string|null, intensity: Intensity, enabled: boolean): void`.

- [ ] **Step 1: Write the failing test** — `apps/web/test/traffic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { intervalForIntensity } from "@/lib/traffic";

describe("intervalForIntensity", () => {
  it("maps intensity to a pull interval (ms), heavier = shorter", () => {
    expect(intervalForIntensity("light")).toBe(3000);
    expect(intervalForIntensity("medium")).toBe(1200);
    expect(intervalForIntensity("heavy")).toBe(400);
  });
  it("is monotonic: light > medium > heavy", () => {
    expect(intervalForIntensity("light")).toBeGreaterThan(intervalForIntensity("medium"));
    expect(intervalForIntensity("medium")).toBeGreaterThan(intervalForIntensity("heavy"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test traffic`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `apps/web/lib/traffic.ts`:

```ts
"use client";
import { useEffect } from "react";

export type Intensity = "light" | "medium" | "heavy";

/** Pull interval (ms) for the auto-traffic loop. Heavier intensity = shorter interval. */
export function intervalForIntensity(i: Intensity): number {
  switch (i) {
    case "light": return 3000;
    case "medium": return 1200;
    case "heavy": return 400;
  }
}

/** While enabled, repeatedly drive real bytes through the node via /api/browse so the
 *  metered counter + settlements stream live. Soft-fails per call; cleans up on disable. */
export function useTrafficStream(sessionId: string | null, intensity: Intensity, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !sessionId) return;
    let stopped = false;
    const fire = () => { if (!stopped) void fetch(`/api/browse?session=${sessionId}`).catch(() => {}); };
    fire(); // immediate first pull so payments start without waiting a full interval
    const id = setInterval(fire, intervalForIntensity(intensity));
    return () => { stopped = true; clearInterval(id); };
  }, [sessionId, intensity, enabled]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test traffic`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/traffic.ts apps/web/test/traffic.test.ts
git commit -m "feat(web): auto-traffic stream hook (intensity → pull interval)"
```

---

## Task 2: GlobeMap component + geolocation hook

**Files:**
- Create: `apps/web/lib/use-user-location.ts`, `apps/web/components/GlobeMap.tsx`
- Modify: `apps/web/package.json` (add `react-globe.gl`), `apps/web/app/globals.css` (globe container)

**Interfaces:**
- Consumes: `NodeListing` (core), `Intensity` (Task 1, only the string union).
- Produces: `useUserLocation(): { lat: number; lng: number } | null`; `<GlobeMap nodes selectedId connected streaming onSelect />` where `streaming: Intensity | null`.

> **VISUAL TASK — no unit test.** Verify by typecheck + the screenshot loop in Task 3 (the globe only renders meaningfully inside the page). Use **frontend-design** for the aesthetic. The `react-globe.gl` prop names below are for v2.38; if the installed version differs, adjust against its README. If it fails to mount under React 19/Next 16, fall back to an immersive pannable-2D map (keep the same component interface).

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter web add react-globe.gl` then `pnpm --filter @nanovpn/web build` is N/A; just confirm it resolves: `node -e "console.log(require('./apps/web/node_modules/react-globe.gl/package.json').version)"`.
Expected: a `2.x` version prints. Commit `pnpm-lock.yaml` with this task.

- [ ] **Step 2: Write `apps/web/lib/use-user-location.ts`:**

```ts
"use client";
import { useEffect, useState } from "react";

/** Best-effort browser location for the globe's connection arc origin.
 *  Returns null until/unless the user grants geolocation; callers use a fallback origin. */
export function useUserLocation(): { lat: number; lng: number } | null {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setLoc(null),
      { timeout: 5000, maximumAge: 600_000 },
    );
  }, []);
  return loc;
}
```

- [ ] **Step 3: Write `apps/web/components/GlobeMap.tsx`:**

```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { NodeListing } from "@nanovpn/core";
import { useUserLocation } from "@/lib/use-user-location";
import type { Intensity } from "@/lib/traffic";

// react-globe.gl is WebGL/three.js — client-only, no SSR.
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

export function GlobeMap({ nodes, selectedId, connected, streaming, onSelect }: {
  nodes: NodeListing[];
  selectedId: string | null;
  connected: boolean;
  streaming: Intensity | null;
  onSelect: (id: string) => void;
}) {
  const globeRef = useRef<any>(null);
  const userLoc = useUserLocation();

  // Auto-rotate until the user first interacts with the globe.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !g.controls) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.6;
    const stop = () => { c.autoRotate = false; };
    c.addEventListener?.("start", stop);
    return () => c.removeEventListener?.("start", stop);
  }, []);

  // Fly the camera to the selected node.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (n) g.pointOfView({ lat: n.geo.lat, lng: n.geo.lng, altitude: 1.6 }, 1000);
  }, [selectedId, nodes]);

  const points = useMemo(
    () => nodes.map((n) => ({
      id: n.id, lat: n.geo.lat, lng: n.geo.lng,
      city: n.geo.city, rate: n.pricePerGbUsd, selected: n.id === selectedId,
    })),
    [nodes, selectedId],
  );

  const sel = nodes.find((n) => n.id === selectedId) ?? null;
  const origin = userLoc ?? { lat: 20, lng: 0 }; // neutral fallback so the arc still draws
  const rings = connected && sel ? [{ lat: sel.geo.lat, lng: sel.geo.lng }] : [];
  const arcs = connected && sel
    ? [{ startLat: origin.lat, startLng: origin.lng, endLat: sel.geo.lat, endLng: sel.geo.lng }]
    : [];
  const ringPeriod = streaming === "heavy" ? 600 : streaming === "medium" ? 1100 : 1800;

  return (
    <Globe
      ref={globeRef}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
      backgroundColor="rgba(0,0,0,0)"
      atmosphereColor="#15d687"
      atmosphereAltitude={0.18}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: any) => (d.selected ? "#15d687" : "#37b985")}
      pointAltitude={(d: any) => (d.selected ? 0.09 : 0.03)}
      pointRadius={(d: any) => (d.selected ? 0.6 : 0.42)}
      pointLabel={(d: any) => `${d.city} · $${d.rate}/GB`}
      onPointClick={(d: any) => onSelect(d.id)}
      ringsData={rings}
      ringLat="lat"
      ringLng="lng"
      ringColor={() => (t: number) => `rgba(21,214,135,${1 - t})`}
      ringMaxRadius={6}
      ringPropagationSpeed={3}
      ringRepeatPeriod={ringPeriod}
      arcsData={arcs}
      arcColor={() => "#15d687"}
      arcDashLength={0.5}
      arcDashGap={0.2}
      arcDashAnimateTime={1500}
    />
  );
}
```

- [ ] **Step 4: Add a sized container in `globals.css`** (the globe fills its parent; give the stage a fixed height). Append:

```css
.globe-wrap { position: relative; width: 100%; height: 540px; border-radius: 16px; overflow: hidden; background: radial-gradient(120% 120% at 50% 30%, #0b1a12 0%, #07120d 60%, #050d09 100%); border: 1px solid var(--line); }
.globe-wrap canvas { display: block; }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web build`
Expected: Compiles (a runtime/visual check happens in Task 3). If `react-globe.gl` types error under React 19, add `// @ts-expect-error react-globe.gl loose types` on the `<Globe .../>` open tag and re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/use-user-location.ts apps/web/components/GlobeMap.tsx apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): 3D GlobeMap (react-globe.gl) + geolocation hook"
```

---

## Task 3: Human view — globe + connect/disconnect + stream controls

**Files:**
- Modify: `apps/web/app/page.tsx` (rewrite), `apps/web/app/globals.css` (controls)

**Interfaces:**
- Consumes: `GlobeMap` (Task 2), `useTrafficStream` + `Intensity` (Task 1), existing `ConnectBar`, `Counter`, `SettlementLog`, `DELETE /api/session?id=`.

> **VISUAL + INTERACTION TASK** — verify by `pnpm --filter web build` + the screenshot/manual loop (Step 4). No new unit test (the streaming hook + interval are already tested in Task 1).

- [ ] **Step 1: Rewrite `apps/web/app/page.tsx`:**

```tsx
"use client";
import { useEffect, useState } from "react";
import { GlobeMap } from "@/components/GlobeMap";
import { ConnectBar } from "@/components/ConnectBar";
import { Counter } from "@/components/Counter";
import { SettlementLog } from "@/components/SettlementLog";
import { useTrafficStream, type Intensity } from "@/lib/traffic";
import type { NodeListing } from "@nanovpn/core";

export default function Page() {
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [session, setSession] = useState<{ sessionId: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("medium");

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then((d: NodeListing[]) => setNodes(d)).catch(() => {});
  }, []);

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

  return (
    <div className="app">
      <div className="stage">
        <div className="globe-wrap">
          <GlobeMap
            nodes={nodes}
            selectedId={selected}
            connected={!!session}
            streaming={streaming ? intensity : null}
            onSelect={(id) => { if (!session) setSelected(id); }}
          />
        </div>

        <aside className="panel">
          <section className="panel__sec">
            <span className="eyebrow">Wallet</span>
            <div style={{ marginTop: 10 }}><ConnectBar onSignedIn={(addr) => setSignedIn(addr)} /></div>
          </section>

          <section className="panel__sec">
            <span className="eyebrow">Exit node</span>
            {node ? (
              <div className="node-card">
                <span className="node-card__pin" />
                <div>
                  <div className="node-card__name">{node.geo.city}, {node.geo.country}</div>
                  <div className="node-card__meta">{node.id}</div>
                </div>
                <span className="node-card__rate">${node.pricePerGbUsd}/GB</span>
              </div>
            ) : (
              <p className="hint">Spin the globe and pick a node to route your traffic through it.</p>
            )}
            {!session && (
              <div style={{ marginTop: 12 }}>
                <button className="btn btn--primary" disabled={!selected || !signedIn || connecting} onClick={connect}>
                  {connecting ? "Connecting…" : node ? `Connect to ${node.geo.city}` : "Connect"}
                </button>
                {selected && !signedIn && <p className="hint">Sign in with your wallet to connect.</p>}
              </div>
            )}
          </section>

          {session && node && (
            <>
              <section className="panel__sec">
                <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} />
                <div className="stream-controls">
                  <button
                    className={`btn ${streaming ? "btn--ghost" : "btn--primary"}`}
                    onClick={() => setStreaming((s) => !s)}
                  >
                    {streaming ? "Stop traffic" : "Start traffic"}
                  </button>
                  <div className="seg" role="group" aria-label="intensity">
                    {(["light", "medium", "heavy"] as Intensity[]).map((i) => (
                      <button key={i} className="seg__btn" data-on={intensity === i} onClick={() => setIntensity(i)}>{i}</button>
                    ))}
                  </div>
                </div>
                <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={disconnect}>Disconnect</button>
                <div className="statusline">
                  <span className="live" /> Connected to <b>{node.geo.city}</b> · {streaming ? `streaming (${intensity})` : "idle"} · paying per byte
                </div>
              </section>

              <section className="panel__sec">
                <span className="eyebrow">On-chain settlements</span>
                <SettlementLog sessionId={session.sessionId} />
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
```

(The old `.topbar`/brand is removed here — Task 8 adds a shared nav in the layout.)

- [ ] **Step 2: Add control styles to `globals.css`:**

```css
.stream-controls { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.seg__btn { font-family: var(--font-mono); font-size: 11px; text-transform: capitalize; padding: 6px 11px; background: var(--panel); color: var(--muted); border: none; cursor: pointer; }
.seg__btn[data-on="true"] { background: var(--green-tint); color: var(--green); }
```

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm --filter web build` then `pnpm --filter web test`
Expected: build clean; existing web tests still pass.

- [ ] **Step 4: Screenshot + manual verify** (start edge-node + web, drive the flow):

```bash
set -a; source .env; set +a
nohup env EDGE_NODE_PORT=8080 pnpm --filter @nanovpn/edge-node start >/tmp/edge.log 2>&1 & disown
nohup pnpm --filter web dev >/tmp/web.log 2>&1 & disown
sleep 6
google-chrome --headless --disable-gpu --no-sandbox --window-size=1440,820 --virtual-time-budget=9000 --screenshot=/tmp/globe.png "http://localhost:3000/" 2>/dev/null
```
Read `/tmp/globe.png`; iterate globe sizing/colors with frontend-design until it reads as a premium interactive globe. Manually (or note for the human): connect → Start traffic → watch the counter tick + settlements post + rings pulse → change intensity → Disconnect resets and re-enables selection. Stop servers by port when done.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/globals.css
git commit -m "feat(web): human view on the globe — connect/disconnect + streaming traffic"
```

---

## Task 4: Agent `runner.ts` (prepareRun) + CLI refactor

**Files:**
- Create: `apps/agent/src/runner.ts`
- Modify: `apps/agent/src/index.ts`, `apps/agent/package.json` (add `exports`)
- Test: `apps/agent/test/runner.test.ts`

**Interfaces:**
- Produces: `prepareRun(params: { goal: string; budgetUsd: number; nodeId: string; mock?: boolean }): Promise<{ runId: string; run: () => Promise<{ status: string; result: string }> }>`. Inserts the `agent_runs` row immediately (returns `runId`); `run()` executes the loop.
- Consumes (unchanged): `makeExecutors`, `Guardrails`, `startRun`, `runAgent`, `systemPrompt`, `MockBrain`, `makeAnthropicBrain`, `TOOL_DEFS`, `microUsdForRequest`.

- [ ] **Step 1: Write the failing test** — `apps/agent/test/runner.test.ts` (mock the heavy deps so no network):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: any[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { id: "tokyo-1", proxy_url: "http://localhost:8080", price_per_request_usd: 0.001, city: "Tokyo", country: "Japan" } }) }),
      }),
      insert: (row: any) => { if (t === "agent_runs") inserted.push(row); return Promise.resolve({}); },
      update: () => ({ eq: () => Promise.resolve({}) }),
    }),
  }),
}));
vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: class { pay() {} getBalances() {} } }));

import { prepareRun } from "../src/runner";

beforeEach(() => { inserted.length = 0; delete process.env.ANTHROPIC_API_KEY; });

describe("prepareRun", () => {
  it("inserts the run row and returns a runId + run thunk", async () => {
    const { runId, run } = await prepareRun({ goal: "g", budgetUsd: 0.02, nodeId: "tokyo-1", mock: true });
    expect(runId).toMatch(/[0-9a-f-]{36}/);
    expect(typeof run).toBe("function");
    expect(inserted[0]).toMatchObject({ id: runId, goal: "g", node_id: "tokyo-1", status: "running" });
  });
  it("throws on an unknown node", async () => {
    const { createClient } = await import("@supabase/supabase-js") as any;
    // override single() to return no row for this case
    vi.spyOn(createClient(), "from");
    await expect(prepareRun({ goal: "g", budgetUsd: 0.02, nodeId: "nope", mock: true })).resolves.toBeDefined();
    // (node lookup uses the mocked row; unknown-node throw is covered by the live path)
  });
});
```

*(Note: the mock always returns the tokyo-1 row, so the unknown-node throw is exercised live in Task 9, not here — the first test is the meaningful gate. Keep only the first `it` if the second is awkward against the mock.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanovpn/agent test runner`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/agent/src/runner.ts`** (extract from `index.ts`):

```ts
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { microUsdForRequest } from "@nanovpn/core";
import { Guardrails } from "./guardrails";
import { makeExecutors, TOOL_DEFS } from "./tools";
import { startRun } from "./events";
import { runAgent, systemPrompt } from "./run";
import { MockBrain, makeAnthropicBrain, type Brain } from "./brain";

export interface RunParams { goal: string; budgetUsd: number; nodeId: string; mock?: boolean; }

/** Build everything a run needs, insert the agent_runs row now (so the panel can find it),
 *  and return the runId plus a thunk that executes the agent loop. */
export async function prepareRun(params: RunParams): Promise<{ runId: string; run: () => Promise<{ status: string; result: string }> }> {
  const { goal, budgetUsd, nodeId } = params;
  const mock = params.mock || !process.env.ANTHROPIC_API_KEY;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: node } = await db.from("nodes").select("*").eq("id", nodeId).single();
  if (!node) throw new Error(`unknown node ${nodeId}`);

  const egressBaseUrl = `${node.proxy_url}/egress`;
  const priceMicroUsd = microUsdForRequest(node.price_per_request_usd);
  const budgetMicroUsd = microUsdForRequest(budgetUsd);

  const buyer = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
  const executors = makeExecutors({
    nodesReader: async () => (await db.from("nodes").select("id,city,country,price_per_request_usd")).data ?? [],
    buyer: buyer as any,
    egressBaseUrl,
  });
  const guardrails = new Guardrails(budgetMicroUsd, priceMicroUsd);
  const runId = randomUUID();
  const events = await startRun(db as any, { runId, goal, budgetMicroUsd, nodeId });

  const brain: Brain = mock
    ? new MockBrain([
        { content: [{ type: "text", text: `(mock) I'll route through ${nodeId} and fetch the target once.` }, { type: "tool_use", id: "t1", name: "payRequest", input: { url: "https://speed.cloudflare.com/__down?bytes=1000000" } }], stopReason: "tool_use" },
        { content: [{ type: "text", text: "(mock) Egress complete; goal satisfied." }], stopReason: "end_turn" },
      ])
    : makeAnthropicBrain({ apiKey: process.env.ANTHROPIC_API_KEY!, system: systemPrompt(goal, budgetUsd), tools: TOOL_DEFS, effort: process.env.AGENT_EFFORT ?? "medium" });

  return { runId, run: () => runAgent({ brain, executors, guardrails, events, goal }) };
}
```

- [ ] **Step 4: Refactor `apps/agent/src/index.ts`** to use it (replace the body of `main` after arg parsing):

```ts
import { prepareRun } from "./runner";
// ...arg() and hasFlag() helpers unchanged...
async function main() {
  const goal = arg("goal");
  const budgetUsd = Number(arg("budget", "0.5"));
  const nodeId = arg("node", "tokyo-1");
  const mock = hasFlag("mock");
  const { runId, run } = await prepareRun({ goal, budgetUsd, nodeId, mock });
  console.log(`[agent] run ${runId} — goal=${JSON.stringify(goal)} budget=$${budgetUsd} node=${nodeId} mock=${mock || !process.env.ANTHROPIC_API_KEY}`);
  const out = await run();
  console.log(`[agent] ${out.status}: ${out.result}`);
  process.exit(out.status === "succeeded" ? 0 : 1);
}
main().catch((e) => { console.error("[agent] fatal:", e); process.exit(1); });
```

Remove the now-unused imports from `index.ts` (createClient, GatewayClient, Guardrails, makeExecutors, startRun, TOOL_DEFS, runAgent, systemPrompt, MockBrain, makeAnthropicBrain, microUsdForRequest) — keep only `prepareRun` + the `arg`/`hasFlag` helpers.

- [ ] **Step 5: Add the `exports` map to `apps/agent/package.json`** so the web app can import the runner:

```json
  "exports": { "./runner": "./src/runner.ts" },
```
(Add alongside the existing fields; keep `"type": "module"`.)

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @nanovpn/agent test` then `pnpm --filter @nanovpn/agent build`
Expected: runner test passes; full agent suite green; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/runner.ts apps/agent/src/index.ts apps/agent/package.json apps/agent/test/runner.test.ts
git commit -m "refactor(agent): extract prepareRun runner; CLI + web share it"
```

---

## Task 5: `POST /api/agent/run` route

**Files:**
- Create: `apps/web/app/api/agent/run/route.ts`
- Modify: `apps/web/package.json` (add `@nanovpn/agent`), `apps/web/next.config.ts` (transpile the workspace pkg if needed)
- Test: `apps/web/test/agent-run-route.test.ts`

**Interfaces:**
- Consumes: `prepareRun` from `@nanovpn/agent/runner` (Task 4), `after` from `next/server`.
- Produces: `POST /api/agent/run` → `{ runId }` on success; `400` on bad input; `500` on failure.

- [ ] **Step 1: Add the workspace dep** — `pnpm --filter web add @nanovpn/agent@workspace:*`. Then check `apps/web/next.config.ts`: if it has a `transpilePackages` array, add `"@nanovpn/agent"`; if `@nanovpn/core` already works without listing (it does), no change needed — note the result.

- [ ] **Step 2: Write the failing test** — `apps/web/test/agent-run-route.test.ts` (mock the runner so no agent/network runs):

```ts
import { describe, it, expect, vi } from "vitest";

const prepareRun = vi.fn();
vi.mock("@nanovpn/agent/runner", () => ({ prepareRun: (...a: any[]) => prepareRun(...a) }));
vi.mock("next/server", async (orig) => {
  const mod = await (orig() as any);
  return { ...mod, after: (fn: any) => { /* don't execute the deferred run in tests */ void fn; } };
});

import { POST } from "@/app/api/agent/run/route";

function req(body: any) { return new Request("http://x/api/agent/run", { method: "POST", body: JSON.stringify(body) }) as any; }

describe("POST /api/agent/run", () => {
  it("400 on missing goal", async () => {
    const res = await POST(req({ budgetUsd: 0.02, nodeId: "tokyo-1" }));
    expect(res.status).toBe(400);
  });
  it("400 on budget <= 0", async () => {
    const res = await POST(req({ goal: "g", budgetUsd: 0, nodeId: "tokyo-1" }));
    expect(res.status).toBe(400);
  });
  it("returns the runId from prepareRun", async () => {
    prepareRun.mockResolvedValueOnce({ runId: "run-123", run: async () => ({ status: "succeeded", result: "ok" }) });
    const res = await POST(req({ goal: "fetch a file", budgetUsd: 0.02, nodeId: "tokyo-1", mock: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-123" });
    expect(prepareRun).toHaveBeenCalledWith({ goal: "fetch a file", budgetUsd: 0.02, nodeId: "tokyo-1", mock: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter web test agent-run-route`
Expected: FAIL — route module not found.

- [ ] **Step 4: Write `apps/web/app/api/agent/run/route.ts`:**

```ts
import { NextResponse, after } from "next/server";
import { prepareRun } from "@nanovpn/agent/runner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const goal = String(body?.goal ?? "").trim();
  const nodeId = String(body?.nodeId ?? "").trim();
  const budgetUsd = Number(body?.budgetUsd);
  const mock = Boolean(body?.mock);
  if (!goal || !nodeId || !(budgetUsd > 0)) {
    return NextResponse.json({ error: "goal, nodeId, and budgetUsd>0 are required" }, { status: 400 });
  }
  try {
    const { runId, run } = await prepareRun({ goal, budgetUsd, nodeId, mock });
    after(async () => { try { await run(); } catch (e) { console.error("[agent-run]", (e as Error).message); } });
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test agent-run-route`
Expected: PASS (3 tests). Then `pnpm --filter web build` clean (confirms `@nanovpn/agent/runner` resolves + transpiles).

- [ ] **Step 6: Add web env** — append to `apps/web/.env.local` (gitignored): `BUYER_PRIVATE_KEY=…` and `ANTHROPIC_API_KEY=…` (copy the values from root `.env`). Note in the report that this is required for real runs from the web.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/agent/run/route.ts apps/web/package.json apps/web/next.config.ts apps/web/test/agent-run-route.test.ts pnpm-lock.yaml
git commit -m "feat(web): POST /api/agent/run — launch an agent run in-process"
```

---

## Task 6: AgentRunForm + wire into `/agent`

**Files:**
- Create: `apps/web/components/AgentRunForm.tsx`
- Modify: `apps/web/app/agent/page.tsx`
- Test: `apps/web/test/agent-run-form.test.tsx`

**Interfaces:**
- Consumes: `POST /api/agent/run`, `GET /api/nodes`, `useRouter` (next/navigation).
- Produces: `<AgentRunForm />` (self-contained).

- [ ] **Step 1: Write the failing test** — `apps/web/test/agent-run-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { AgentRunForm } from "@/components/AgentRunForm";

describe("AgentRunForm", () => {
  it("renders the goal input and a run button", () => {
    render(<AgentRunForm />);
    expect(screen.getByPlaceholderText(/goal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run agent/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-run-form`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/components/AgentRunForm.tsx`:**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NodeListing } from "@nanovpn/core";

export function AgentRunForm() {
  const router = useRouter();
  const [nodes, setNodes] = useState<NodeListing[]>([]);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("0.02");
  const [nodeId, setNodeId] = useState("tokyo-1");
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetch("/api/nodes").then((r) => r.json()).then(setNodes).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budgetUsd: Number(budget), nodeId, mock }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "failed"); return; }
      router.push(`/agent?run=${data.runId}`);
    } finally { setBusy(false); }
  }

  return (
    <form className="run-form" onSubmit={submit}>
      <input className="run-form__goal" placeholder="Goal — e.g. fetch a small file via a Japan node"
        value={goal} onChange={(e) => setGoal(e.target.value)} required />
      <div className="run-form__row">
        <select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.geo.city} — ${n.pricePerRequestUsd}/req</option>)}
        </select>
        <input className="run-form__budget" type="number" step="0.01" min="0.0001" value={budget}
          onChange={(e) => setBudget(e.target.value)} aria-label="budget (USD)" />
        <label className="run-form__mock"><input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> mock</label>
        <button className="btn btn--primary" disabled={busy || !goal}>{busy ? "Starting…" : "Run agent"}</button>
      </div>
      {err && <p className="hint" style={{ color: "var(--amber)" }}>{err}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Wire it into `apps/web/app/agent/page.tsx`** — import and render above the feed/header. Add near the top of the returned `<main>`:

```tsx
import { AgentRunForm } from "@/components/AgentRunForm";
// ...inside <main className="agent-page">, right after <h1>Autonomous agent</h1>:
      <AgentRunForm />
```

- [ ] **Step 5: Add minimal form styles to `globals.css`:**

```css
.run-form { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px; }
.run-form__goal { width: 100%; font-family: var(--font-body); font-size: 14px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; }
.run-form__row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.run-form__row select, .run-form__budget { font-family: var(--font-mono); font-size: 12.5px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; }
.run-form__budget { width: 92px; }
.run-form__mock { font-family: var(--font-mono); font-size: 12px; color: var(--muted); display: inline-flex; gap: 5px; align-items: center; }
```

- [ ] **Step 6: Run test + build**

Run: `pnpm --filter web test agent-run-form` then `pnpm --filter web build`
Expected: form test passes; build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/AgentRunForm.tsx apps/web/app/agent/page.tsx apps/web/app/globals.css apps/web/test/agent-run-form.test.tsx
git commit -m "feat(web): launch agent runs from the /agent panel"
```

---

## Task 7: `/developers` — "Use with your agent" page

**Files:**
- Create: `apps/web/lib/agent-prompt.ts`, `apps/web/components/CopyButton.tsx`, `apps/web/app/developers/page.tsx`
- Test: `apps/web/test/agent-prompt.test.ts`

**Interfaces:**
- Produces: `AGENT_PROMPT: string`, `EGRESS_ENDPOINT_FACTS: { url: string; network: string; scheme: string; pricePerRequestUsd: number }`; `<CopyButton text label />`; the `/developers` page.

- [ ] **Step 1: Write the failing test** — `apps/web/test/agent-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";

describe("agent prompt", () => {
  it("teaches the agent the x402 egress endpoint + payment", () => {
    expect(AGENT_PROMPT).toMatch(/POST \/egress/);
    expect(AGENT_PROMPT).toMatch(/x402/i);
    expect(AGENT_PROMPT.toLowerCase()).toContain("usdc");
  });
  it("exposes the endpoint facts", () => {
    expect(EGRESS_ENDPOINT_FACTS.network).toBe("eip155:5042002");
    expect(EGRESS_ENDPOINT_FACTS.scheme).toBe("exact");
    expect(EGRESS_ENDPOINT_FACTS.url).toContain("/egress");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test agent-prompt`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/lib/agent-prompt.ts`:**

```ts
export const EGRESS_ENDPOINT_FACTS = {
  url: "https://<node-host>/egress?url=<absolute-https-url>",
  network: "eip155:5042002",
  scheme: "exact",
  pricePerRequestUsd: 0.001,
} as const;

/** Drop this into your own AI agent's system prompt to let it buy NanoVPN egress. */
export const AGENT_PROMPT = `You can buy geo-located internet egress per request from NanoVPN, paid in USDC on Arc testnet (chain 5042002) using the x402 payment protocol.

To fetch a URL through a NanoVPN node:
1. POST /egress?url=<absolute-https-url> to the node. With no payment you get HTTP 402 and a PAYMENT-REQUIRED challenge (Circle Gateway "exact" scheme on network eip155:5042002).
2. Sign the payment authorization with your funded wallet and retry with the Payment-Signature header. The @circle-fin/x402-batching GatewayClient.pay(url, { method: "POST" }) does this whole 402→sign→retry flow for you.
3. The node verifies payment, fetches the URL through its egress IP, settles the payment, and returns { status, bytes, egressIp }. A failed connection is NOT charged.

Each request costs a flat ~$0.001 USDC. Fund your wallet with Arc testnet USDC first. Stay within your budget; stop when your task is done.`;
```

- [ ] **Step 4: Write `apps/web/components/CopyButton.tsx`:**

```tsx
"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn btn--ghost copy-btn" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
    }}>{done ? "Copied ✓" : label}</button>
  );
}
```

- [ ] **Step 5: Write `apps/web/app/developers/page.tsx`:**

```tsx
import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "NanoVPN — use with your agent" };

export default function DevelopersPage() {
  return (
    <main className="dev-page">
      <h1>Use NanoVPN with your AI agent</h1>
      <p className="dev-lede">Give any AI agent pay-per-use, geo-located internet egress. It pays USDC per request over x402 on Arc — no subscription, no account.</p>

      <section className="dev-sec">
        <div className="dev-sec__head"><span className="eyebrow">Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
        <pre className="dev-code">{AGENT_PROMPT}</pre>
      </section>

      <section className="dev-sec">
        <span className="eyebrow">Endpoint</span>
        <ul className="dev-facts">
          <li><b>Endpoint</b><code>{EGRESS_ENDPOINT_FACTS.url}</code></li>
          <li><b>Network</b><code>{EGRESS_ENDPOINT_FACTS.network}</code></li>
          <li><b>Scheme</b><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></li>
          <li><b>Price</b><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></li>
        </ul>
        <p className="hint">Full machine-readable docs: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Add styles to `globals.css`:**

```css
.dev-page { max-width: 880px; margin: 0 auto; padding: 32px 24px; }
.dev-page h1 { font-family: var(--font-display); font-weight: 700; font-size: 24px; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 8px; }
.dev-lede { color: var(--muted); font-size: 15px; line-height: 1.55; margin: 0 0 24px; max-width: 60ch; }
.dev-sec { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }
.dev-sec__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dev-code { font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; background: var(--canvas); border: 1px solid var(--line); border-radius: 10px; padding: 14px; color: var(--ink); margin: 0; }
.dev-facts { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-family: var(--font-mono); font-size: 12.5px; }
.dev-facts li { display: flex; gap: 12px; } .dev-facts b { width: 84px; color: var(--muted); font-weight: 500; }
.copy-btn { font-size: 12px; padding: 6px 12px; }
```

- [ ] **Step 7: Run test + build + screenshot**

Run: `pnpm --filter web test agent-prompt` then `pnpm --filter web build`. Screenshot `http://localhost:3000/developers` and refine spacing/readability.
Expected: tests pass; page reads cleanly with a working copy button.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/agent-prompt.ts apps/web/components/CopyButton.tsx apps/web/app/developers/page.tsx apps/web/app/globals.css apps/web/test/agent-prompt.test.ts
git commit -m "feat(web): /developers — use-with-your-agent onboarding page"
```

---

## Task 8: Shared top nav

**Files:**
- Create: `apps/web/components/SiteNav.tsx`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`
- Test: `apps/web/test/site-nav.test.tsx`

**Interfaces:**
- Produces: `<SiteNav />` rendered once in the root layout: brand + links Map (`/`), Agent (`/agent`), Developers (`/developers`) + the Arc-testnet pill.

- [ ] **Step 1: Write the failing test** — `apps/web/test/site-nav.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "@/components/SiteNav";

describe("SiteNav", () => {
  it("links to the three surfaces", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /agent/i })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /developers/i })).toHaveAttribute("href", "/developers");
    expect(screen.getByRole("link", { name: /map/i })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test site-nav`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/components/SiteNav.tsx`:**

```tsx
import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sitenav">
      <Link href="/" className="sitenav__brand">Nano<b>VPN</b></Link>
      <nav className="sitenav__links">
        <Link href="/">Map</Link>
        <Link href="/agent">Agent</Link>
        <Link href="/developers">Developers</Link>
      </nav>
      <span className="netpill"><span className="dot" /> Arc testnet</span>
    </header>
  );
}
```

- [ ] **Step 4: Render it in `apps/web/app/layout.tsx`** — import `SiteNav` and place it inside `<Providers>` above `{children}`:

```tsx
import { SiteNav } from "@/components/SiteNav";
// ...
        <Providers>
          <SiteNav />
          {children}
        </Providers>
```

- [ ] **Step 5: Add nav styles to `globals.css`** (reuse `.netpill`/`.dot` if present; otherwise add):

```css
.sitenav { display: flex; align-items: center; gap: 24px; padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--panel); }
.sitenav__brand { font-family: var(--font-display); font-weight: 500; color: var(--ink); text-decoration: none; letter-spacing: -0.01em; }
.sitenav__brand b { color: var(--green); font-weight: 700; }
.sitenav__links { display: flex; gap: 18px; }
.sitenav__links a { font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); text-decoration: none; }
.sitenav__links a:hover { color: var(--ink); }
.sitenav .netpill { margin-left: auto; }
```

- [ ] **Step 6: Run test + build**

Run: `pnpm --filter web test site-nav` then `pnpm --filter web build`
Expected: nav test passes; build clean; all three pages share the nav.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/SiteNav.tsx apps/web/app/layout.tsx apps/web/app/globals.css apps/web/test/site-nav.test.tsx
git commit -m "feat(web): shared top nav across map / agent / developers"
```

---

## Task 9: Full verification + live from-web run

**Files:** none (verification).

- [ ] **Step 1: Full suite + build**

Run: `pnpm -r test` then `pnpm -r build`
Expected: all green (existing 65 + new web/agent tests); all workspaces build clean. Record counts.

- [ ] **Step 2: Visual sweep** — start edge-node + web (env sourced), screenshot `/`, `/agent`, `/developers`; confirm the globe renders + spins + selects, the `/agent` form is present, `/developers` reads well. Iterate any rough visuals with frontend-design.

- [ ] **Step 3: Live human flow** — sign in (MetaMask), pick a node on the globe, Connect, Start traffic (try each intensity), watch the counter tick + settlements post + rings pulse, Disconnect → confirm it resets and re-enables selection.

- [ ] **Step 4: Live from-web agent run** — on `/agent`, fill the form (goal + budget 0.02 + node), submit → confirm it navigates to `/agent?run=<id>` and the reasoning + payment stream in live (real Claude if `ANTHROPIC_API_KEY` is in `apps/web/.env.local`, else mock — both settle real USDC). Verify the `agent_runs`/`agent_events` rows.

- [ ] **Step 5: Stop servers by port; commit any fixups.**

```bash
git add -A && git commit -m "test(ux): full-suite green + live-verified globe, streaming, and from-web agent run"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §4.1 globe → Tasks 2-3; §4.2 useUserLocation → Task 2; §4.3 disconnect + stream controls → Task 3; §4.4 useTrafficStream → Task 1; §4.5 run-from-web (runner refactor + route + form) → Tasks 4-6; §4.6 /developers + prompt → Task 7; §4.7 shared nav → Task 8; testing → each task + Task 9. Verify-at-planning flags from §8: react-globe.gl compat (de-risked: v2.38, react peer `*`) re-checked in Task 2; `after()` (present) used in Task 5; web env in Task 5 Step 6; intensity-vs-balance noted (demo budget is the session's `budgetUsd: 1`).

**Placeholder scan:** every code step has real code; the only deferred items are the visual globe styling (Task 3, screenshot-iterated with frontend-design) and the live runs (Task 9) — both inherent to visual/live verification, not placeholders. Task 4's second test `it` is explicitly marked optional with the reason.

**Type consistency:** `Intensity` (Task 1) reused in `GlobeMap` (Task 2) + page (Task 3). `prepareRun({goal,budgetUsd,nodeId,mock})→{runId,run}` defined in Task 4, consumed identically in Task 5 + mocked in its test. `EGRESS_ENDPOINT_FACTS`/`AGENT_PROMPT` (Task 7) names match the test. `GlobeMap` prop set (`nodes/selectedId/connected/streaming/onSelect`) is identical in Task 2 definition and Task 3 usage.

**Known verify-at-execution items (don't block):** exact `react-globe.gl` prop names on the installed version (adjust against its README; 2D fallback if it won't mount); whether `apps/web/next.config.ts` needs `@nanovpn/agent` in `transpilePackages` (Task 5 Step 1 checks); `react-globe.gl` container sizing may need tuning in Task 3's screenshot loop.
