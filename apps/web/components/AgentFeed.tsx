"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatUsd } from "./format";

interface Event { id: string; seq: number; kind: string; content: any; }

export function AgentFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb.channel(`agent-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p) => setEvents((prev) => prev.some((e) => e.id === (p.new as Event).id) ? prev : [...prev, p.new as Event].sort((a, b) => a.seq - b.seq)))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await sb.from("agent_events").select("*").eq("run_id", runId).order("seq", { ascending: true });
          setEvents((data as Event[]) ?? []);
        }
      });
    return () => { sb.removeChannel(channel); };
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
              <span>{e.content.status} · {e.content.bytes}B · {e.content.egressIp}</span>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
