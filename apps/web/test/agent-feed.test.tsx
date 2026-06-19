// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }),
  }),
}));

import { AgentFeed } from "@/components/AgentFeed";

describe("AgentFeed", () => {
  it("renders empty state for a run with no events yet", () => {
    render(<AgentFeed runId="r1" />);
    expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
  });
});
