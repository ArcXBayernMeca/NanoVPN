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

  it("does not double-pay a session whose settle is still in flight", async () => {
    const registry = new SessionRegistry();
    registry.register({ id: "due", token: "a", nodeId: "n", pricePerGbUsd: 3, budgetMicroUsd: 1e9 });
    registry.addBytes("due", 5_000_000); // due (>= $0.01)

    // A pay() that never resolves within the test window: the first tick leaves
    // the session in-flight; the second tick must skip it.
    const buyer = { pay: vi.fn().mockReturnValue(new Promise(() => {})) };
    const now = Date.now();

    const first = runSettlementTick(registry, buyer, "http://node/settle", now);
    const second = await runSettlementTick(registry, buyer, "http://node/settle", now);

    expect(buyer.pay).toHaveBeenCalledTimes(1);
    expect(second).toEqual([]); // second tick saw nothing eligible
    void first; // first tick's pay() never resolves; intentionally not awaited
  });
});
