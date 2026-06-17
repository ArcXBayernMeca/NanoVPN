import { describe, it, expect } from "vitest";
import { newSessionToken } from "../lib/session";

describe("newSessionToken", () => {
  it("returns a 32-byte url-safe hex token, unique per call", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
