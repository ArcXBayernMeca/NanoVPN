"use client";
import { WorldMap } from "./WorldMap";
import { formatUsd } from "./format";
import { useAgentRunStatus } from "@/lib/use-agent-run-status";
import type { NodeListing } from "@nanovpn/core";

export function AgentStatusRail({ runId, initialNodeId, initialSpentMicroUsd, budgetMicroUsd, initialStatus, nodes }: {
  runId: string; initialNodeId: string | null; initialSpentMicroUsd: number; budgetMicroUsd: number; initialStatus: string; nodes: NodeListing[];
}) {
  const { nodeId, spentMicroUsd, status } = useAgentRunStatus(runId, { nodeId: initialNodeId, spentMicroUsd: initialSpentMicroUsd, status: initialStatus });
  const pct = budgetMicroUsd > 0 ? Math.min(100, Math.round((spentMicroUsd / budgetMicroUsd) * 100)) : 0;
  const chosen = nodes.find((n) => n.id === nodeId) ?? null;
  return (
    <aside className="agent-rail">
      <span className="eyebrow">Chosen node</span>
      <div className="agent-rail__globe">
        <WorldMap nodes={nodes} selectedId={nodeId} connected={!!nodeId} streaming={null} onSelect={() => {}} />
      </div>
      <div className="agent-rail__node">{chosen ? `● ${chosen.geo.city}, ${chosen.geo.country}` : "choosing…"}</div>
      <span className="eyebrow">Budget</span>
      <div className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></div>
      <div className="agent-rail__spend">{formatUsd(spentMicroUsd)} / {formatUsd(budgetMicroUsd)}</div>
      <div className="agent-rail__status" data-status={status}>{status.replace("_", " ")}</div>
    </aside>
  );
}
