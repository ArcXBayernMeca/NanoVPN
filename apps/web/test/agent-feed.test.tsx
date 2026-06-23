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

  it("clears a previous run's events when switching to a new runId", async () => {
    eventsRef.current = [
      { id: "old1", seq: 1, kind: "reasoning", content: { text: "coffee in buenos aires" } },
      { id: "old2", seq: 2, kind: "result", content: { result: "Coffee answer." } },
    ];
    const { rerender } = render(<AgentFeed runId="rOld" />);
    await waitFor(() => expect(screen.getByText("coffee in buenos aires")).toBeInTheDocument());

    // Navigate to a new run (client-side): same component instance, new runId + new events.
    eventsRef.current = [
      { id: "new1", seq: 1, kind: "reasoning", content: { text: "cricket rankings" } },
      { id: "new2", seq: 2, kind: "result", content: { result: "Cricket answer." } },
    ];
    rerender(<AgentFeed runId="rNew" />);

    // The old run's events must be gone — not interleaved with the new ones.
    await waitFor(() => expect(screen.getByText("cricket rankings")).toBeInTheDocument());
    expect(screen.queryByText("coffee in buenos aires")).not.toBeInTheDocument();
    expect(screen.queryByText("Coffee answer.")).not.toBeInTheDocument();
  });

  it("renders the answer's markdown instead of showing raw ** and ` markers", async () => {
    eventsRef.current = [
      { id: "e1", seq: 1, kind: "result", content: {
        result: "I used the **sao-paulo-1** node (egress `216.246.19.66`).\n\n- HTTP 200\n- 111 KB",
      } },
    ];
    const { container } = render(<AgentFeed runId="r3" />);
    await waitFor(() => expect(screen.getByText(/^Answer$/)).toBeInTheDocument());
    const card = container.querySelector(".agent-answer__body")!;
    // Bold/code become real elements; raw markdown punctuation is gone.
    expect(card.querySelector("strong")?.textContent).toBe("sao-paulo-1");
    expect(card.querySelector("code")?.textContent).toBe("216.246.19.66");
    expect(card.querySelectorAll("li")).toHaveLength(2);
    expect(card.textContent).not.toContain("**");
    expect(card.textContent).not.toContain("`");
  });

  it("lays out a payment as amount+proof on one line and the meta (incl. egress IP) on its own", async () => {
    eventsRef.current = [
      { id: "p1", seq: 1, kind: "payment", content: {
        amountMicroUsd: 1000, status: "200", bytes: 1_460_000,
        egressIp: "216.246.19.66", transaction: "11111111-1111-1111-1111-111111111111",
      } },
    ];
    const { container } = render(<AgentFeed runId="r4" />);
    await waitFor(() => expect(screen.getByText(/216\.246\.19\.66/)).toBeInTheDocument());
    const li = container.querySelector(".agent-payments li")!;
    // Amount and the "✓ verified" proof toggle share the top row; the meta is a sibling line.
    const row = li.querySelector(".agent-pay__row")!;
    expect(row.querySelector(".agent-amt")?.textContent).toContain("$0.0010");
    expect(row.querySelector(".sproof")).toBeTruthy();
    const meta = li.querySelector(".agent-pay__meta")!;
    expect(meta.textContent).toBe("200 · 1.46 MB · 216.246.19.66");
    // The meta must NOT be nested inside the top row (otherwise it competes for width and clips).
    expect(row.contains(meta)).toBe(false);
  });
});
