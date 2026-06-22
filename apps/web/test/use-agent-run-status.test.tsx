// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// Capture the realtime UPDATE handler so the test can fire a row update.
const { handlerRef } = vi.hoisted(() => ({ handlerRef: { current: null as null | ((p: any) => void) } }));
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({
      on(_evt: string, _cfg: any, cb: (p: any) => void) { handlerRef.current = cb; return this; },
      subscribe() { return this; },
    }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  }),
}));

import { useAgentRunStatus } from "@/lib/use-agent-run-status";

function Probe() {
  const s = useAgentRunStatus("r1", { nodeId: null, spentMicroUsd: 0, status: "running" });
  return <div>{`${s.nodeId ?? "none"}|${s.spentMicroUsd}|${s.status}`}</div>;
}

describe("useAgentRunStatus", () => {
  it("applies live agent_runs UPDATEs", async () => {
    render(<Probe />);
    expect(screen.getByText("none|0|running")).toBeInTheDocument();
    await act(async () => { handlerRef.current?.({ new: { node_id: "tokyo-1", spent_micro_usd: 1000, status: "running" } }); });
    await waitFor(() => expect(screen.getByText("tokyo-1|1000|running")).toBeInTheDocument());
  });
});
