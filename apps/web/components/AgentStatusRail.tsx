"use client";
import { GlobeMap } from "./GlobeMap";
import { formatUsd } from "./format";
import type { NodeListing } from "@nanovpn/core";

export function AgentStatusRail({ nodeId, spentMicroUsd, budgetMicroUsd, status, nodes }: {
  nodeId: string | null; spentMicroUsd: number; budgetMicroUsd: number; status: string; nodes: NodeListing[];
}) {
  const pct = budgetMicroUsd > 0 ? Math.min(100, Math.round((spentMicroUsd / budgetMicroUsd) * 100)) : 0;
  const chosen = nodes.find((n) => n.id === nodeId) ?? null;
  return (
    <aside className="agent-rail">
      <span className="eyebrow">Chosen node</span>
      <div className="agent-rail__globe">
        <GlobeMap nodes={nodes} selectedId={nodeId} connected={!!nodeId} streaming={null} onSelect={() => {}} />
      </div>
      <div className="agent-rail__node">{chosen ? `● ${chosen.geo.city}, ${chosen.geo.country}` : "choosing…"}</div>
      <span className="eyebrow">Budget</span>
      <div className="agent-gauge"><span className="agent-gauge__fill" style={{ width: `${pct}%` }} /></div>
      <div className="agent-rail__spend">{formatUsd(spentMicroUsd)} / {formatUsd(budgetMicroUsd)}</div>
      <div className="agent-rail__status" data-status={status}>{status.replace("_", " ")}</div>
    </aside>
  );
}
