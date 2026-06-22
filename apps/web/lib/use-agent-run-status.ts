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
