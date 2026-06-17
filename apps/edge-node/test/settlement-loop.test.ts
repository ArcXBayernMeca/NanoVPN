import { describe, it, expect, vi } from "vitest";
import { runSettlementTick } from "../src/settlement-loop";
import { SessionRegistry } from "../src/sessions";

describe("runSettlementTick", () => {
  it("pays only sessions that are due", async () => {
    const registry = new SessionRegistry();
    registry.register({ id: "due", token: "a", nodeId: "n", pricePerGbUsd: 3, budgetMicroUsd: 1e9 });
    registry.register({ id: "notdue", token: "b", nodeId: "n", pricePerGbUsd: 3, budgetMicroUsd: 1e9 });
    registry.addBytes("due", 5_000_000);  // 15000 µUSD -> due (>= $0.01)
    registry.addBytes("notdue", 10_000);  // 30 µUSD -> not due

    const buyer = { pay: vi.fn().mockResolvedValue({ status: 200 }) };
    const attempted = await runSettlementTick(registry, buyer, "http://node/settle", Date.now());

    expect(attempted).toEqual(["due"]);
    expect(buyer.pay).toHaveBeenCalledTimes(1);
    expect(buyer.pay).toHaveBeenCalledWith("http://node/settle?session=due");
  });

  it("swallows a buyer.pay error without throwing (retries next tick)", async () => {
    const registry = new SessionRegistry();
    registry.register({ id: "due", token: "a", nodeId: "n", pricePerGbUsd: 3, budgetMicroUsd: 1e9 });
    registry.addBytes("due", 5_000_000);
    const buyer = { pay: vi.fn().mockRejectedValue(new Error("network")) };
    await expect(runSettlementTick(registry, buyer, "http://node/settle", Date.now())).resolves.toEqual(["due"]);
  });
});
