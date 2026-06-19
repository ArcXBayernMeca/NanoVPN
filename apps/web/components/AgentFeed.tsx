"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatUsd } from "./format";

interface Event { id: string; seq: number; kind: string; content: any; }

const fmtBytes = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : n >= 1_000 ? `${(n / 1_000).toFixed(1)} KB` : `${n} B`;

export function AgentFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    // Merge by id, keep ordered by seq — used by both the initial backfill and live inserts.
    const upsert = (incoming: Event[]) =>
      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        for (const e of incoming) byId.set(e.id, e);
        return [...byId.values()].sort((a, b) => a.seq - b.seq);
      });

    // 1. Backfill immediately on mount — independent of realtime, so a completed run
    //    (which emits no new inserts) renders even if the websocket is slow or down.
    void (async () => {
      const { data } = await sb.from("agent_events").select("*").eq("run_id", runId).order("seq", { ascending: true });
      if (!cancelled && data) upsert(data as Event[]);
    })();

    // 2. Live updates for an in-flight run.
    const channel = sb.channel(`agent-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p) => upsert([p.new as Event]))
      .subscribe();

    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [runId]);

  const reasoning = events.filter((e) => e.kind === "reasoning" || e.kind === "tool_call" || e.kind === "result" || e.kind === "error");
  const payments = events.filter((e) => e.kind === "payment");

  return (
    <div className="agent-grid">
      <section className="agent-reasoning">
        <h2>Reasoning</h2>
        {reasoning.length === 0 ? <p className="muted">Waiting for the agent to think…</p> : (
          <ul>{reasoning.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <span className="agent-kind">{e.kind}</span>
              <span>{e.kind === "reasoning" ? e.content.text : e.kind === "tool_call" ? `${e.content.name}(${JSON.stringify(e.content.input)})` : e.kind === "result" ? e.content.result : e.content.message}</span>
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
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
