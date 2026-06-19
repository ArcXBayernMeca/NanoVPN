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
