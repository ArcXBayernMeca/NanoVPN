import { describe, it, expect } from "vitest";
import { runIdToLoad } from "@/lib/agent-run-query";

describe("runIdToLoad", () => {
  it("returns null when no run param (new visitor → empty state)", () => {
    expect(runIdToLoad(undefined)).toBeNull();
    expect(runIdToLoad("")).toBeNull();
    expect(runIdToLoad("   ")).toBeNull();
  });
  it("returns the run id when present", () => {
    expect(runIdToLoad("abc-123")).toBe("abc-123");
  });
});
