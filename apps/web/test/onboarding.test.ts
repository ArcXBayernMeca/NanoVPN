import { describe, it, expect } from "vitest";
import { GET as onboarding } from "@/app/agent-onboarding/route";
import { GET as llms } from "@/app/llms.txt/route";

describe("served agent docs", () => {
  it("agent-onboarding documents the x402 egress endpoint and faucet (reference)", async () => {
    const text = await (await onboarding()).text();
    expect(text).toMatch(/POST \/egress/);
    expect(text).toMatch(/x402/i);
    expect(text).toMatch(/faucet/i);
  });
  it("llms.txt points at the onboarding doc", async () => {
    const text = await (await llms()).text();
    expect(text).toMatch(/agent-onboarding/);
  });
});
