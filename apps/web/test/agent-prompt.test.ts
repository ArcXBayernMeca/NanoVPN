import { describe, it, expect } from "vitest";
import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";

describe("agent prompt", () => {
  it("teaches the agent the x402 egress endpoint + payment", () => {
    expect(AGENT_PROMPT).toMatch(/POST \/egress/);
    expect(AGENT_PROMPT).toMatch(/x402/i);
    expect(AGENT_PROMPT.toLowerCase()).toContain("usdc");
  });
  it("exposes the endpoint facts", () => {
    expect(EGRESS_ENDPOINT_FACTS.network).toBe("eip155:5042002");
    expect(EGRESS_ENDPOINT_FACTS.scheme).toBe("exact");
    expect(EGRESS_ENDPOINT_FACTS.url).toContain("/egress");
  });
});
