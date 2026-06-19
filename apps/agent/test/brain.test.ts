import { describe, it, expect } from "vitest";
import { MockBrain } from "../src/brain";

describe("MockBrain", () => {
  it("returns queued turns in order then throws when exhausted", async () => {
    const brain = new MockBrain([
      { content: [{ type: "tool_use", id: "t1", name: "listNodes", input: {} }], stopReason: "tool_use" },
      { content: [{ type: "text", text: "done" }], stopReason: "end_turn" },
    ]);
    expect((await brain.next([])).stopReason).toBe("tool_use");
    expect((await brain.next([])).stopReason).toBe("end_turn");
    await expect(brain.next([])).rejects.toThrow();
  });
});
