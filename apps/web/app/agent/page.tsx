import { supabaseService } from "@/lib/supabase-server";
import { AgentFeed } from "@/components/AgentFeed";
import { formatUsd } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const db = supabaseService();
  const cols = "id,goal,status,spent_micro_usd,budget_micro_usd,node_id";
  const { data: row } = run
    ? await db.from("agent_runs").select(cols).eq("id", run).maybeSingle()
    : await db.from("agent_runs").select(cols).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!row) {
    return (
      <main className="agent-page">
        <h1>Autonomous agent</h1>
        <p className="muted">No agent runs yet. Start one: <code>pnpm agent --goal &quot;…&quot; --budget 0.5</code></p>
      </main>
    );
  }

  const pct = row.budget_micro_usd > 0 ? Math.min(100, Math.round((row.spent_micro_usd / row.budget_micro_usd) * 100)) : 0;

  return (
    <main className="agent-page">
      <h1>Autonomous agent</h1>
      <header className="agent-run">
        <p className="agent-run__goal">{row.goal}</p>
        <div className="agent-run__meta">
          <span className="agent-run__node">{row.node_id ?? "—"}</span>
          <span className="agent-run__status" data-status={row.status}>{row.status.replace("_", " ")}</span>
          <span className="agent-run__spend">
            <span className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></span>
            {formatUsd(row.spent_micro_usd)} / {formatUsd(row.budget_micro_usd)}
          </span>
        </div>
      </header>
      <AgentFeed runId={row.id} />
    </main>
  );
}
