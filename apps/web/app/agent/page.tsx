import { supabaseService } from "@/lib/supabase-server";
import { runIdToLoad } from "@/lib/agent-run-query";
import { AgentFeed } from "@/components/AgentFeed";
import { AgentRunForm } from "@/components/AgentRunForm";
import { AgentStatusRail } from "@/components/AgentStatusRail";
import type { NodeListing } from "@nanovpn/core";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const runId = runIdToLoad(run);
  const db = supabaseService();
  const cols = "id,goal,status,spent_micro_usd,budget_micro_usd,node_id";
  const { data: row } = runId
    ? await db.from("agent_runs").select(cols).eq("id", runId).maybeSingle()
    : { data: null };
  const { data: nodeRows } = await db.from("nodes").select("id,city,country,lat,lng,operator_address,price_per_gb_usd,price_per_request_usd");
  const nodes: NodeListing[] = (nodeRows ?? []).map((n: any) => ({ id: n.id, operatorAddress: n.operator_address, geo: { city: n.city, country: n.country, lat: n.lat, lng: n.lng }, proxyUrl: "", settleUrl: "", pricePerGbUsd: n.price_per_gb_usd, pricePerRequestUsd: n.price_per_request_usd }));

  if (!row) {
    return (
      <main className="agent-page">
        <h1>Watch the AI work</h1>
        <AgentRunForm />
        <p className="muted">Launch an agent above to watch it reason and pay per request.</p>
      </main>
    );
  }
  const seller = nodes.find((n) => n.id === row.node_id)?.operatorAddress;

  return (
    <main className="agent-page">
      <h1>Watch the AI work</h1>
      <AgentRunForm />
      <header className="agent-run"><p className="agent-run__goal">{row.goal}</p></header>
      <div className="agent-layout">
        <AgentFeed runId={row.id} sellerAddress={seller} />
        <AgentStatusRail nodeId={row.node_id} spentMicroUsd={row.spent_micro_usd} budgetMicroUsd={row.budget_micro_usd} status={row.status} nodes={nodes} />
      </div>
    </main>
  );
}
