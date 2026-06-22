// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { eventsRef } = vi.hoisted(() => ({ eventsRef: { current: [] as any[] } }));
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: eventsRef.current }) }) }) }),
  }),
}));

import { AgentFeed } from "@/components/AgentFeed";

describe("AgentFeed", () => {
  it("renders empty state for a run with no events yet", () => {
    eventsRef.current = [];
    render(<AgentFeed runId="r1" />);
    expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
  });

  it("shows an Answer card and does not double-render the duplicate final reasoning", async () => {
    eventsRef.current = [
      { id: "e1", seq: 1, kind: "reasoning", content: { text: "thinking about it" } },
      { id: "e2", seq: 2, kind: "reasoning", content: { text: "The answer is 42." } },
      { id: "e3", seq: 3, kind: "result", content: { result: "The answer is 42." } },
    ];
    render(<AgentFeed runId="r2" />);
    await waitFor(() => expect(screen.getByText(/^Answer$/)).toBeInTheDocument());
    // "The answer is 42." appears exactly once (in the Answer card, not also as reasoning)
    await waitFor(() => expect(screen.getAllByText("The answer is 42.")).toHaveLength(1));
  });
});
