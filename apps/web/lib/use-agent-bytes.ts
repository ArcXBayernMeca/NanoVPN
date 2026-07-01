"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

/** Live total bytes fetched across the run's payment events (initial sum + realtime INSERTs). */
export function useAgentBytes(runId: string): number {
  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;
    void (async () => {
      const { data } = await sb.from("agent_events").select("content").eq("run_id", runId).eq("kind", "payment");
      if (!cancelled && data) setBytes(data.reduce((sum: number, r: any) => sum + Number(r.content?.bytes ?? 0), 0));
    })();
    const channel = sb.channel(`agent-bytes-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` },
        (p: any) => { if (p.new?.kind === "payment") setBytes((b) => b + Number(p.new.content?.bytes ?? 0)); })
      .subscribe();
    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [runId]);
  return bytes;
}
