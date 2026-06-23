"use client";
import { useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatUsd } from "./format";
import { SettlementProof } from "./SettlementProof";

interface Event { id: string; seq: number; kind: string; content: any; }

const fmtBytes = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : n >= 1_000 ? `${(n / 1_000).toFixed(1)} KB` : `${n} B`;

// The agent's answer is freeform markdown from Claude. Render the common inline
// marks (bold / inline-code / italic) and block shapes (paragraphs, bullet &
// numbered lists, headings) without pulling in a markdown dependency.
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[\s\S]+?\*\*|`[^`]+`|\*[^*\n]+?\*)/g;
  let last = 0, key = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(src: string): ReactNode[] {
  return src.trim().split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
      return <ul key={i}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>;
    if (lines.every((l) => /^\s*\d+\.\s+/.test(l)))
      return <ol key={i}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""))}</li>)}</ol>;
    const h = lines.length === 1 ? block.match(/^#{1,6}\s+(.*)$/) : null;
    if (h) return <p key={i} className="agent-answer__h">{renderInline(h[1])}</p>;
    return <p key={i}>{renderInline(lines.join(" "))}</p>;
  });
}

export function AgentFeed({ runId }: { runId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    // Drop the previous run's events: on client-side navigation between runs this
    // component instance is reused, and each run's `seq` restarts at 0 — without a
    // reset the two runs would interleave when sorted by seq.
    setEvents([]);
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
            <div className="agent-answer__body">{renderMarkdown(answer)}</div>
          </div>
        )}
        <h2>Reasoning</h2>
        {reasoning.length === 0 ? <p className="muted">Waiting for the agent to think…</p> : (
          <ul>{reasoning.map((e) => (
            <li key={e.id} data-kind={e.kind}>
              <span className="agent-kind">{e.kind}</span>
              <span className="agent-reason__text">{e.kind === "reasoning" ? e.content.text : e.kind === "tool_call" ? `${e.content.name}(${JSON.stringify(e.content.input)})` : e.content.message}</span>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="agent-payments">
        <h2>Payments</h2>
        {payments.length === 0 ? <p className="muted">No payments yet.</p> : (
          <ul>{payments.map((e) => (
            <li key={e.id}>
              <div className="agent-pay__row">
                <span className="agent-amt">{formatUsd(e.content.amountMicroUsd)}</span>
                <SettlementProof uuid={e.content.transaction} amountMicroUsd={e.content.amountMicroUsd} />
              </div>
              <span className="agent-pay__meta">{e.content.status} · {fmtBytes(e.content.bytes)} · {e.content.egressIp}</span>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
