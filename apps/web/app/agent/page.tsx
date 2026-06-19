import { supabaseService } from "@/lib/supabase-server";
import { AgentFeed } from "@/components/AgentFeed";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  let runId = run ?? null;
  if (!runId) {
    const db = supabaseService();
    const { data } = await db.from("agent_runs").select("id").order("created_at", { ascending: false }).limit(1).single();
    runId = data?.id ?? null;
  }
  return (
    <main className="agent-page">
      <h1>Autonomous agent</h1>
      {runId ? <AgentFeed runId={runId} /> : <p className="muted">No agent runs yet. Start one: <code>pnpm agent --goal &quot;…&quot; --budget 0.5</code></p>}
    </main>
  );
}
