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
