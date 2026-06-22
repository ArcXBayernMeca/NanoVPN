# Agent & Settlement UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent status rail update live, present settlements with honest verifiable proof (no fake tx link), show the agent's answer clearly, and warn when settlement stalls.

**Architecture:** All changes are in `apps/web` (Next 16 App Router, React 19). A new realtime hook drives the agent rail from `agent_runs`; a shared `SettlementProof` component + a facilitator-proxy API route replace dead ArcScan links; `AgentFeed` gains an Answer card; `MapRail` gains a client-side settlement-paused warning fed by the usage SSE.

**Tech Stack:** Next.js 16, React 19, TypeScript (ESM), Supabase JS realtime, vitest + @testing-library/react (jsdom per-file).

## Global Constraints

- **Web-only.** No edge-node / Fly / agent (`apps/agent`) changes. Merging needs only a Vercel redeploy.
- **No new runtime dependencies.**
- Client components touching `navigator`/`window`/realtime/`EventSource` start with `"use client"`.
- USDC is 6 decimals — always format with `formatUsd` from `apps/web/components/format.ts` (`$${(microUsd/1e6).toFixed(4)}`).
- Tests: vitest; DOM tests opt into jsdom via a `// @vitest-environment jsdom` docblock; `@/` maps to `apps/web/`. Mock `@/lib/supabase`, `fetch`, and `EventSource` as needed (see existing `test/agent-feed.test.tsx`, `test/agent-run-route.test.ts`).
- Settlement-stuck threshold: `STUCK_UNSETTLED_MICRO_USD = 50_000` ($0.05 = 5× the $0.01 settle threshold).
- Facilitator transfer endpoint: `GET ${ARC.facilitator}/v1/x402/transfers/{uuid}` returns `{ fromAddress, toAddress, amount, status, sendingNetwork, ... }` (no tx hash). `ARC.facilitator` = `https://gateway-api-testnet.circle.com`.
- Copy (verbatim): badge `✓ verified`, anchor `Payer wallet on Arc ↗`, answer heading `Answer`, warning `⚠ Settlement paused — buyer balance low (unsettled <amt> not posting).`
- `explorerAddr(a)` from `@nanovpn/core` → `${ARC.explorer}/address/${a}`.

---

### Task 1: Settlement-proof infrastructure (API route + shared component)

The reusable building blocks for honest settlement proof: a server route proxying the Circle facilitator (avoids browser CORS) and a `SettlementProof` component (a `✓ verified` toggle that reveals from→to / amount / Arc / status, lazily upgrading status from the facilitator on first expand).

**Files:**
- Create: `apps/web/app/api/settlement/[uuid]/route.ts`
- Create: `apps/web/components/SettlementProof.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/settlement-route.test.ts`, `apps/web/test/settlement-proof.test.tsx`

**Interfaces:**
- Consumes: `ARC` from `@nanovpn/core`; `formatUsd` from `@/components/format`.
- Produces:
  - `GET(req: Request, ctx: { params: Promise<{ uuid: string }> }): Promise<Response>` → JSON `{ from, to, amount, status, network }` or `{ error }` (HTTP 502).
  - `function SettlementProof(props: { uuid: string; amountMicroUsd: number; payer?: string | null; payee?: string | null; network?: string | null }): JSX.Element`

- [ ] **Step 1: Write the failing route test**

Create `apps/web/test/settlement-route.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/settlement/[uuid]/route";

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/settlement/[uuid]", () => {
  it("maps the facilitator transfer record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ fromAddress: "0xa", toAddress: "0xb", amount: "11309", status: "completed", sendingNetwork: "eip155:5042002" }),
    })));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ uuid: "u1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "0xa", to: "0xb", amount: "11309", status: "completed", network: "eip155:5042002" });
  });

  it("returns 502 when the facilitator errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ uuid: "u1" }) });
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run the route test (expect fail)**

Run: `pnpm --filter web test settlement-route`
Expected: FAIL — `Cannot find module '@/app/api/settlement/[uuid]/route'`.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/settlement/[uuid]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ARC } from "@nanovpn/core";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params;
  try {
    const r = await fetch(`${ARC.facilitator}/v1/x402/transfers/${uuid}`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "facilitator error", status: r.status }, { status: 502 });
    const j = await r.json();
    return NextResponse.json({
      from: j.fromAddress ?? null,
      to: j.toAddress ?? null,
      amount: j.amount ?? null,
      status: j.status ?? null,
      network: j.sendingNetwork ?? null,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the route test (expect pass)**

Run: `pnpm --filter web test settlement-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing component test**

Create `apps/web/test/settlement-proof.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettlementProof } from "@/components/SettlementProof";

afterEach(() => vi.unstubAllGlobals());

describe("SettlementProof", () => {
  it("shows the verified badge and reveals facilitator details on expand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ from: "0xaaaa000000000000000000000000000000000001", to: "0xbbbb000000000000000000000000000000000002", status: "completed", network: "eip155:5042002" }),
    })));
    render(<SettlementProof uuid="u1" amountMicroUsd={11309} />);
    const badge = screen.getByRole("button", { name: /verified/i });
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);
    await waitFor(() => expect(screen.getByText(/completed/i)).toBeInTheDocument());
    expect(screen.getByText(/Arc \(eip155:5042002\)/i)).toBeInTheDocument();
    expect(screen.getByText("$0.0113")).toBeInTheDocument();
  });

  it("falls back to provided payer/payee if the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    render(<SettlementProof uuid="u1" amountMicroUsd={5000} payer="0x1111000000000000000000000000000000000011" payee="0x2222000000000000000000000000000000000022" />);
    fireEvent.click(screen.getByRole("button", { name: /verified/i }));
    await waitFor(() => expect(screen.getByText(/0x1111…0011 → 0x2222…0022/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run the component test (expect fail)**

Run: `pnpm --filter web test settlement-proof`
Expected: FAIL — `Cannot find module '@/components/SettlementProof'`.

- [ ] **Step 7: Implement SettlementProof**

Create `apps/web/components/SettlementProof.tsx`:

```tsx
"use client";
import { useState } from "react";
import { formatUsd } from "./format";

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** "✓ verified" toggle for a Gateway settlement (no per-payment on-chain tx exists).
 *  Reveals from→to / amount / Arc / status; lazily upgrades status from the facilitator. */
export function SettlementProof({ uuid, amountMicroUsd, payer, payee, network }: {
  uuid: string; amountMicroUsd: number; payer?: string | null; payee?: string | null; network?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState<{ from?: string | null; to?: string | null; status?: string | null; network?: string | null } | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !rec) {
      try {
        const r = await fetch(`/api/settlement/${uuid}`);
        if (r.ok) setRec(await r.json());
      } catch { /* keep the caller-provided fallback values */ }
    }
  };

  const from = rec?.from ?? payer ?? null;
  const to = rec?.to ?? payee ?? null;
  const net = rec?.network ?? network ?? "eip155:5042002";
  const status = rec?.status ?? "received";

  return (
    <div className="sproof">
      <button className="sproof__toggle" aria-expanded={open} onClick={toggle}>✓ verified {open ? "▴" : "▾"}</button>
      {open && (
        <dl className="sproof__detail">
          <div><dt>amount</dt><dd>{formatUsd(amountMicroUsd)}</dd></div>
          <div><dt>from → to</dt><dd>{short(from)} → {short(to)}</dd></div>
          <div><dt>network</dt><dd>Arc ({net})</dd></div>
          <div><dt>status</dt><dd>{status}</dd></div>
        </dl>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the component test (expect pass)**

Run: `pnpm --filter web test settlement-proof`
Expected: PASS (2 tests).

- [ ] **Step 9: Add styles**

Append to `apps/web/app/globals.css`:

```css
/* ---------- settlement proof ---------- */
.sproof__toggle { background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-mono); font-size: 11.5px; color: var(--green); }
.sproof__toggle:hover { color: var(--green-bright); }
.sproof__detail { margin: 6px 0 2px; display: grid; gap: 3px; font-family: var(--font-mono); font-size: 11px; }
.sproof__detail > div { display: flex; justify-content: space-between; gap: 10px; }
.sproof__detail dt { color: var(--muted); }
.sproof__detail dd { margin: 0; color: var(--ink-2); }
.maprail .sproof__detail dd { color: rgba(234,242,238,.8); }
.maprail .sproof__detail dt { color: rgba(234,242,238,.5); }
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/api/settlement apps/web/components/SettlementProof.tsx apps/web/app/globals.css apps/web/test/settlement-route.test.ts apps/web/test/settlement-proof.test.tsx
git commit -m "feat(web): settlement-proof component + facilitator proxy route"
```

---

### Task 2: Human settlement tape — verified proof + funding anchor

Wire `SettlementProof` into the human `SettlementLog`, select the `payer`/`network` columns it needs, and add one real on-chain anchor to the payer (buyer) wallet.

**Files:**
- Modify: `apps/web/components/SettlementLog.tsx`
- Test: `apps/web/test/settlement-log.test.tsx`

**Interfaces:**
- Consumes: `SettlementProof` (Task 1); `explorerAddr` from `@nanovpn/core`; `supabaseBrowser` from `@/lib/supabase`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/settlement-log.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const row = {
  id: "s1", settlement_uuid: "u1", amount_micro_usd: 11309, status: "received", tx_hash: null,
  payer: "0xb43cbda374e3cd2a3d67827683f81462bacf703b", payee: "0xbad0e18452f7f5f1f4f1fd8e6bcc24a28a5b94dc", network: "eip155:5042002",
};
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe(cb: any) { cb?.("SUBSCRIBED"); return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [row] }) }) }) }),
  }),
}));

import { SettlementLog } from "@/components/SettlementLog";

describe("SettlementLog", () => {
  it("renders the verified proof badge and a payer wallet anchor", async () => {
    render(<SettlementLog sessionId="x" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /verified/i })).toBeInTheDocument());
    const anchor = screen.getByRole("link", { name: /payer wallet on arc/i });
    expect(anchor.getAttribute("href")).toContain(row.payer);
  });
});
```

- [ ] **Step 2: Run the test (expect fail)**

Run: `pnpm --filter web test settlement-log`
Expected: FAIL — no `verified` button / no payer anchor (current component renders a `view ↗` link).

- [ ] **Step 3: Implement**

Replace `apps/web/components/SettlementLog.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { explorerAddr } from "@nanovpn/core";
import { formatUsd } from "./format";
import { SettlementProof } from "./SettlementProof";

interface Row { id: string; settlement_uuid: string; amount_micro_usd: number; status: string; tx_hash: string | null; payer: string; payee: string; network: string; }

export function SettlementLog({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb.channel(`settlements-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "settlements", filter: `session_id=eq.${sessionId}` },
        (p) => setRows((prev) => prev.some((r) => r.id === (p.new as Row).id) ? prev : [p.new as Row, ...prev]))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await sb.from("settlements").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
          setRows((data as Row[]) ?? []);
        }
      });
    return () => { sb.removeChannel(channel); };
  }, [sessionId]);

  const payer = rows[0]?.payer;
  return (
    <div className="tape">
      {rows.length === 0 ? (
        <p className="tape__empty">Settlements post here as your balance streams out — roughly every $0.01 or 10 seconds.</p>
      ) : (
        <>
          <ul className="tape__list">
            {rows.map((r) => (
              <li className="tape__row" key={r.id}>
                <span className="tape__amt">{formatUsd(r.amount_micro_usd)}</span>
                <SettlementProof uuid={r.settlement_uuid} amountMicroUsd={r.amount_micro_usd} payer={r.payer} payee={r.payee} network={r.network} />
              </li>
            ))}
          </ul>
          {payer && (
            <a className="tape__anchor" href={explorerAddr(payer)} target="_blank" rel="noreferrer">Payer wallet on Arc ↗</a>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test (expect pass)**

Run: `pnpm --filter web test settlement-log`
Expected: PASS (1 test).

- [ ] **Step 5: Add anchor style**

Append to `apps/web/app/globals.css`:

```css
.tape__anchor { display: inline-block; margin-top: 8px; font-family: var(--font-mono); font-size: 11px; }
.maprail .tape__anchor { color: var(--green-bright); }
```

- [ ] **Step 6: Run the full web suite (no regressions)**

Run: `pnpm --filter web test`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/SettlementLog.tsx apps/web/app/globals.css apps/web/test/settlement-log.test.tsx
git commit -m "feat(web): human settlement tape uses verified proof + payer anchor"
```

---

### Task 3: AgentFeed — verified payments, Answer card, dedupe

Replace the dead payment link with `SettlementProof`, render the result as an Answer card at the top, and stop double-showing the final reasoning. Also drop the now-unused `sellerAddress` prop (and its use in the page).

**Files:**
- Modify: `apps/web/components/AgentFeed.tsx`
- Modify: `apps/web/app/agent/page.tsx` (drop `sellerAddress`/`seller`)
- Test: `apps/web/test/agent-feed.test.tsx`

**Interfaces:**
- Consumes: `SettlementProof` (Task 1). Payment event content shape: `{ amountMicroUsd, transaction, status, bytes, egressIp, nodeId, txHash }`. Result event content: `{ result }`.
- Produces: `AgentFeed(props: { runId: string }): JSX.Element` (no longer takes `sellerAddress`).

- [ ] **Step 1: Write the failing test**

Replace `apps/web/test/agent-feed.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { eventsRef } = vi.hoisted(() => ({ eventsRef: { current: [] as any[] } }));
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: eventsRef.current }) }) }) }),
  }),
}));

import { AgentFeed } from "@/components/AgentFeed";

describe("AgentFeed", () => {
  it("renders empty state for a run with no events yet", () => {
    eventsRef.current = [];
    render(<AgentFeed runId="r1" />);
    expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
  });

  it("shows an Answer card and does not double-render the duplicate final reasoning", async () => {
    eventsRef.current = [
      { id: "e1", seq: 1, kind: "reasoning", content: { text: "thinking about it" } },
      { id: "e2", seq: 2, kind: "reasoning", content: { text: "The answer is 42." } },
      { id: "e3", seq: 3, kind: "result", content: { result: "The answer is 42." } },
    ];
    render(<AgentFeed runId="r2" />);
    await waitFor(() => expect(screen.getByText(/^Answer$/)).toBeInTheDocument());
    // "The answer is 42." appears exactly once (in the Answer card, not also as reasoning)
    await waitFor(() => expect(screen.getAllByText("The answer is 42.")).toHaveLength(1));
  });
});
```

- [ ] **Step 2: Run the test (expect fail)**

Run: `pnpm --filter web test agent-feed`
Expected: FAIL — no `Answer` heading; the duplicate text renders twice.

- [ ] **Step 3: Implement**

Replace `apps/web/components/AgentFeed.tsx` with:

```tsx
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatUsd } from "./format";
import { SettlementProof } from "./SettlementProof";

interface Event { id: string; seq: number; kind: string; content: any; }

const fmtBytes = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : n >= 1_000 ? `${(n / 1_000).toFixed(1)} KB` : `${n} B`;

export function AgentFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    const upsert = (incoming: Event[]) =>
      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        for (const e of incoming) byId.set(e.id, e);
        return [...byId.values()].sort((a, b) => a.seq - b.seq);
      });

    void (async () => {
      const { data } = await sb.from("agent_events").select("*").eq("run_id", runId).order("seq", { ascending: true });
      if (!cancelled && data) upsert(data as Event[]);
    })();

    const channel = sb.channel(`agent-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p) => upsert([p.new as Event]))
      .subscribe();

    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [runId]);

  const resultEvent = events.find((e) => e.kind === "result");
  const answer = resultEvent?.content?.result as string | undefined;
  // Reasoning trail: drop the result event itself (shown in the Answer card) and any
  // trailing reasoning whose text duplicates the final answer.
  const reasoning = events.filter((e) =>
    (e.kind === "reasoning" || e.kind === "tool_call" || e.kind === "error") &&
    !(e.kind === "reasoning" && answer && e.content?.text?.trim() === answer.trim()));
  const payments = events.filter((e) => e.kind === "payment");

  return (
    <div className="agent-grid">
      <section className="agent-reasoning">
        {answer && (
          <div className="agent-answer">
            <span className="eyebrow">Answer</span>
            <p>{answer}</p>
          </div>
        )}
        <h2>Reasoning</h2>
        {reasoning.length === 0 ? <p className="muted">Waiting for the agent to think…</p> : (
          <ul>{reasoning.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <span className="agent-kind">{e.kind}</span>
              <span>{e.kind === "reasoning" ? e.content.text : e.kind === "tool_call" ? `${e.content.name}(${JSON.stringify(e.content.input)})` : e.content.message}</span>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="agent-payments">
        <h2>Payments</h2>
        {payments.length === 0 ? <p className="muted">No payments yet.</p> : (
          <ul>{payments.map((e) => (
            <li key={e.id}>
              <span className="agent-amt">{formatUsd(e.content.amountMicroUsd)}</span>
              <span className="agent-pay__meta">{e.content.status} · {fmtBytes(e.content.bytes)} · {e.content.egressIp}</span>
              <SettlementProof uuid={e.content.transaction} amountMicroUsd={e.content.amountMicroUsd} />
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Drop the now-unused `sellerAddress` from the page**

In `apps/web/app/agent/page.tsx`: remove the line `const seller = nodes.find((n) => n.id === row.node_id)?.operatorAddress;` and change the feed render from `<AgentFeed runId={row.id} sellerAddress={seller} />` to:

```tsx
<AgentFeed runId={row.id} />
```

- [ ] **Step 5: Run the test (expect pass)**

Run: `pnpm --filter web test agent-feed`
Expected: PASS (2 tests).

- [ ] **Step 6: Add styles**

Append to `apps/web/app/globals.css`:

```css
/* ---------- agent answer card ---------- */
.agent-answer { border: 1px solid var(--green-line); background: var(--green-tint); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
.agent-answer p { margin: 6px 0 0; font-size: 15px; line-height: 1.5; color: var(--ink); }
```

- [ ] **Step 7: Typecheck (page + feed prop change)**

Run: `pnpm --filter web build`
Expected: clean — no TS error about `sellerAddress`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/AgentFeed.tsx apps/web/app/agent/page.tsx apps/web/app/globals.css apps/web/test/agent-feed.test.tsx
git commit -m "feat(web): AgentFeed verified payments + Answer card + dedupe"
```

---

### Task 4: Agent status rail — live updates

Make the rail reflect the run live by subscribing to `agent_runs` (node + spend + status are written there live and the table is in the realtime publication).

**Files:**
- Create: `apps/web/lib/use-agent-run-status.ts`
- Modify: `apps/web/components/AgentStatusRail.tsx`
- Modify: `apps/web/app/agent/page.tsx`
- Test: `apps/web/test/use-agent-run-status.test.tsx`

**Interfaces:**
- Consumes: `supabaseBrowser` from `@/lib/supabase`.
- Produces:
  - `interface AgentRunStatus { nodeId: string | null; spentMicroUsd: number; status: string }`
  - `function useAgentRunStatus(runId: string, initial: AgentRunStatus): AgentRunStatus`
  - `AgentStatusRail(props: { runId: string; initialNodeId: string | null; initialSpentMicroUsd: number; budgetMicroUsd: number; initialStatus: string; nodes: NodeListing[] }): JSX.Element`

- [ ] **Step 1: Write the failing hook test**

Create `apps/web/test/use-agent-run-status.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// Capture the realtime UPDATE handler so the test can fire a row update.
const { handlerRef } = vi.hoisted(() => ({ handlerRef: { current: null as null | ((p: any) => void) } }));
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({
      on(_evt: string, _cfg: any, cb: (p: any) => void) { handlerRef.current = cb; return this; },
      subscribe() { return this; },
    }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  }),
}));

import { useAgentRunStatus } from "@/lib/use-agent-run-status";

function Probe() {
  const s = useAgentRunStatus("r1", { nodeId: null, spentMicroUsd: 0, status: "running" });
  return <div>{`${s.nodeId ?? "none"}|${s.spentMicroUsd}|${s.status}`}</div>;
}

describe("useAgentRunStatus", () => {
  it("applies live agent_runs UPDATEs", async () => {
    render(<Probe />);
    expect(screen.getByText("none|0|running")).toBeInTheDocument();
    await act(async () => { handlerRef.current?.({ new: { node_id: "tokyo-1", spent_micro_usd: 1000, status: "running" } }); });
    await waitFor(() => expect(screen.getByText("tokyo-1|1000|running")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test (expect fail)**

Run: `pnpm --filter web test use-agent-run-status`
Expected: FAIL — `Cannot find module '@/lib/use-agent-run-status'`.

- [ ] **Step 3: Implement the hook**

Create `apps/web/lib/use-agent-run-status.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export interface AgentRunStatus { nodeId: string | null; spentMicroUsd: number; status: string; }

/** Live agent_runs row: seed from `initial`, backfill once, then apply realtime UPDATEs. */
export function useAgentRunStatus(runId: string, initial: AgentRunStatus): AgentRunStatus {
  const [state, setState] = useState<AgentRunStatus>(initial);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    const apply = (row: any) => setState({
      nodeId: row.node_id ?? null,
      spentMicroUsd: row.spent_micro_usd ?? 0,
      status: row.status ?? "running",
    });
    void (async () => {
      const { data } = await sb.from("agent_runs").select("node_id,spent_micro_usd,status").eq("id", runId).maybeSingle();
      if (!cancelled && data) apply(data);
    })();
    const channel = sb.channel(`agent-run-${runId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
        (p) => apply(p.new))
      .subscribe();
    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [runId]);
  return state;
}
```

- [ ] **Step 4: Run the hook test (expect pass)**

Run: `pnpm --filter web test use-agent-run-status`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the rail to the hook**

Replace `apps/web/components/AgentStatusRail.tsx` with:

```tsx
"use client";
import { WorldMap } from "./WorldMap";
import { formatUsd } from "./format";
import { useAgentRunStatus } from "@/lib/use-agent-run-status";
import type { NodeListing } from "@nanovpn/core";

export function AgentStatusRail({ runId, initialNodeId, initialSpentMicroUsd, budgetMicroUsd, initialStatus, nodes }: {
  runId: string; initialNodeId: string | null; initialSpentMicroUsd: number; budgetMicroUsd: number; initialStatus: string; nodes: NodeListing[];
}) {
  const { nodeId, spentMicroUsd, status } = useAgentRunStatus(runId, { nodeId: initialNodeId, spentMicroUsd: initialSpentMicroUsd, status: initialStatus });
  const pct = budgetMicroUsd > 0 ? Math.min(100, Math.round((spentMicroUsd / budgetMicroUsd) * 100)) : 0;
  const chosen = nodes.find((n) => n.id === nodeId) ?? null;
  return (
    <aside className="agent-rail">
      <span className="eyebrow">Chosen node</span>
      <div className="agent-rail__globe">
        <WorldMap nodes={nodes} selectedId={nodeId} connected={!!nodeId} streaming={null} onSelect={() => {}} />
      </div>
      <div className="agent-rail__node">{chosen ? `● ${chosen.geo.city}, ${chosen.geo.country}` : "choosing…"}</div>
      <span className="eyebrow">Budget</span>
      <div className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></div>
      <div className="agent-rail__spend">{formatUsd(spentMicroUsd)} / {formatUsd(budgetMicroUsd)}</div>
      <div className="agent-rail__status" data-status={status}>{status.replace("_", " ")}</div>
    </aside>
  );
}
```

- [ ] **Step 6: Pass live props from the page**

In `apps/web/app/agent/page.tsx`, change the `<AgentStatusRail .../>` render to:

```tsx
<AgentStatusRail runId={row.id} initialNodeId={row.node_id} initialSpentMicroUsd={row.spent_micro_usd} budgetMicroUsd={row.budget_micro_usd} initialStatus={row.status} nodes={nodes} />
```

- [ ] **Step 7: Typecheck + full suite**

Run: `pnpm --filter web build && pnpm --filter web test`
Expected: build clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/use-agent-run-status.ts apps/web/components/AgentStatusRail.tsx apps/web/app/agent/page.tsx apps/web/test/use-agent-run-status.test.tsx
git commit -m "feat(web): agent status rail updates live from agent_runs"
```

---

### Task 5: Settlement-paused safeguard (human rail)

Warn when `unsettled` climbs past the stuck threshold (settlement failing) instead of silently growing.

**Files:**
- Modify: `apps/web/components/Counter.tsx`
- Modify: `apps/web/components/MapRail.tsx` (reuses the existing `.maprail__banner` style — no CSS change)
- Test: `apps/web/test/map-rail-stuck.test.tsx`

**Interfaces:**
- Consumes: `Counter` gains `onUnsettled?(microUsd: number): void`.
- Produces: `MapRail` shows the warning when the latest unsettled ≥ `STUCK_UNSETTLED_MICRO_USD` (50_000).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/map-rail-stuck.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test (expect fail)**

Run: `pnpm --filter web test map-rail-stuck`
Expected: FAIL — no "settlement paused" text.

- [ ] **Step 3: Add the `onUnsettled` callback to Counter**

In `apps/web/components/Counter.tsx`: extend the props and call the callback inside the SSE handler.

Change the signature line:
```tsx
export function Counter({ sessionId, rate, onUnsettled }: { sessionId: string; rate?: number; onUnsettled?: (microUsd: number) => void }) {
```

Change the `es.onmessage` handler to:
```tsx
    es.onmessage = (e) => { const t = JSON.parse(e.data); setTick(t); setLive(true); onUnsettled?.(t.unsettledMicroUsd ?? 0); };
```

(Add `onUnsettled` to the effect dependency array: `}, [sessionId, onUnsettled]);`)

- [ ] **Step 4: Render the warning in MapRail**

In `apps/web/components/MapRail.tsx`:

(a) Add the import and threshold near the top (after the existing imports):
```tsx
import { formatUsd } from "./format";
const STUCK_UNSETTLED_MICRO_USD = 50_000; // $0.05 = 5× the $0.01 settle threshold ⇒ settlement is stuck
```

(b) Inside the component body, add state (next to `bannerDismissed`):
```tsx
  const [unsettled, setUnsettled] = useState(0);
```

(c) Pass the callback to the connected-session `Counter`:
```tsx
            <Counter sessionId={session.sessionId} rate={node.pricePerGbUsd} onUnsettled={setUnsettled} />
```

(d) In the "On-chain settlements" section, render the warning above `<SettlementLog>`:
```tsx
          <section className="maprail__sec">
            <span className="eyebrow">On-chain settlements</span>
            {unsettled >= STUCK_UNSETTLED_MICRO_USD && (
              <p className="maprail__banner">⚠ Settlement paused — buyer balance low (unsettled {formatUsd(unsettled)} not posting).</p>
            )}
            <SettlementLog sessionId={session.sessionId} />
          </section>
```

- [ ] **Step 5: Run the test (expect pass)**

Run: `pnpm --filter web test map-rail-stuck`
Expected: PASS (1 test).

- [ ] **Step 6: Run the existing MapRail test (no regression)**

Run: `pnpm --filter web test map-rail`
Expected: PASS — the existing banner tests still pass (`.maprail__banner` is reused; the new warning only renders with a session + high unsettled).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/Counter.tsx apps/web/components/MapRail.tsx apps/web/test/map-rail-stuck.test.tsx
git commit -m "feat(web): warn when settlement stalls (unsettled climbs past $0.05)"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + build the whole workspace**

Run: `pnpm -r build`
Expected: clean (no TS errors). `apps/web` builds with the new `/api/settlement/[uuid]` route listed.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm -r test`
Expected: all pass (prior counts + the new tests).

- [ ] **Step 3: Manual smoke (after merge + Vercel redeploy)**

On `https://nanovpn-web.vercel.app` (note: needs a buyer Gateway balance > 0 for live settlements):
- [ ] Human: connect + Start traffic → settlement rows post; each shows `✓ verified` that expands to from→to/amount/Arc/completed; "Payer wallet on Arc ↗" opens a real ArcScan address page with on-chain activity.
- [ ] Agent: launch a run from `/agent` → the right rail updates live (chosen node fills in, budget gauge moves, status flips) while payments stream; the final **Answer** card shows the result once (not duplicated below); payment rows show `✓ verified`.
- [ ] Drain check (optional): if the buyer Gateway balance is low, the human rail shows "⚠ Settlement paused — buyer balance low".

> If CSS edits don't appear in dev: `rm -rf apps/web/.next`.

---

## Self-Review

**Spec coverage:**
- #2 rail live-update (hook + agent_runs realtime + page props) → Task 4. ✓
- #1 verified proof component + facilitator proxy → Task 1; human tape wiring + payer anchor → Task 2; agent payments wiring → Task 3. ✓
- #3 Answer card + dedupe (UI only) → Task 3. ✓
- #0 settlement-paused safeguard (Counter onUnsettled + MapRail warning, $0.05) → Task 5. ✓
- Web-only / no edge-node change → all tasks under `apps/web`. ✓
- `/api/settlement` returns `{from,to,amount,status,network}` → Task 1. ✓
- Tests for each → Tasks 1–5; full verification → Task 6. ✓

**Placeholder scan:** none — every code/step is concrete.

**Type consistency:** `AgentRunStatus`/`useAgentRunStatus` defined in Task 4 and used by `AgentStatusRail` (same task); `SettlementProof` prop shape defined in Task 1 and consumed identically in Tasks 2 (`payer`/`payee`/`network`/`uuid`/`amountMicroUsd`) and 3 (`uuid`/`amountMicroUsd`); `AgentFeed` loses `sellerAddress` in Task 3 and the page stops passing it in the same task (build stays green); `onUnsettled` added to `Counter` in Task 5 and used by `MapRail` in the same task. Payment event field `transaction` (the settlement uuid) matches `apps/agent/src/events.ts`. ✓
