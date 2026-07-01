// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const eq2 = vi.fn(async () => ({ data: [{ content: { bytes: 262144 } }, { content: { bytes: 1_000_000 } }] }));
const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: eq2 }) }) }),
    channel: () => channel,
    removeChannel: vi.fn(),
  }),
}));
import { useAgentBytes } from "../lib/use-agent-bytes";

beforeEach(() => vi.clearAllMocks());

describe("useAgentBytes", () => {
  it("sums bytes across the run's payment events", async () => {
    const { result } = renderHook(() => useAgentBytes("run-1"));
    await waitFor(() => expect(result.current).toBe(1_262_144)); // 262144 + 1_000_000
  });
});
