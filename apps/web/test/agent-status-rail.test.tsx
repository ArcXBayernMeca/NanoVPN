// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/WorldMap", () => ({ WorldMap: () => <div>map</div> }));
vi.mock("@/components/WalletBalances", () => ({ WalletBalances: () => <div>wallet-balances</div> }));
let benchProps: any;
vi.mock("@/components/SavingsBenchmark", () => ({ SavingsBenchmark: (p: any) => { benchProps = p; return <div>savings:{p.refUsdPerGb}</div>; } }));
vi.mock("@/lib/use-agent-bytes", () => ({ useAgentBytes: () => 1_000_000 }));
vi.mock("@/lib/use-agent-run-status", () => ({ useAgentRunStatus: () => ({ nodeId: "tokyo-1", spentMicroUsd: 2000, status: "running" }) }));

import { AgentStatusRail } from "../components/AgentStatusRail";
const nodes = [{ id: "tokyo-1", geo: { city: "Tokyo", country: "Japan", lat: 35, lng: 139 }, operatorAddress: "0x0", proxyUrl: "", settleUrl: "", pricePerGbUsd: 3.0, pricePerRequestUsd: 0.001 }] as any;

beforeEach(() => { benchProps = null; });

describe("AgentStatusRail money context", () => {
  it("renders WalletBalances and SavingsBenchmark with the chosen node's per-location reference rate", () => {
    render(<AgentStatusRail runId="r1" initialNodeId="tokyo-1" initialSpentMicroUsd={2000} budgetMicroUsd={50000} initialStatus="running" nodes={nodes} />);
    expect(screen.getByText("wallet-balances")).toBeTruthy();
    expect(benchProps.bytes).toBe(1_000_000);
    expect(benchProps.spentMicroUsd).toBe(2000);
    expect(benchProps.refUsdPerGb).toBe(15); // tokyo pricePerGbUsd 3.0 × RESIDENTIAL_MARKUP 5
  });
});
