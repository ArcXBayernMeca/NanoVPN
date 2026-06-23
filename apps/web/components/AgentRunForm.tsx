"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AgentRunForm() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("0.02");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budgetUsd: Number(budget) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "failed"); return; }
      router.push(`/agent?run=${data.runId}`);
    } finally { setBusy(false); }
  }

  return (
    <form className="run-form" onSubmit={submit}>
      <input className="run-form__goal" placeholder="Goal — e.g. fetch a product price from a Japan-only store"
        value={goal} onChange={(e) => setGoal(e.target.value)} required />
      <div className="run-form__row">
        <label className="run-form__field">
          <span>Max budget (USDC)</span>
          <input className="run-form__budget" type="number" step="0.01" min="0.01" max="0.05"
            value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <button className="btn btn--primary" disabled={busy || !goal}>{busy ? "Starting…" : "Run agent ▸"}</button>
      </div>
      <p className="hint">The agent stops once it has spent this much. It pays real USDC per request on Arc testnet.</p>
      {err && <p className="hint" style={{ color: "var(--amber)" }}>{err}</p>}
    </form>
  );
}
