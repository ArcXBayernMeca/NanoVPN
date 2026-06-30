// apps/web/test/funding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
process.env.USER_GRANT_USD = "0.10";
process.env.USER_GAS_NATIVE = "0.05";

const sendTransaction = vi.fn(async () => "0xgas");
const writeContract = vi.fn(async () => "0xgrant");
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
const deposit = vi.fn(async () => ({ depositTxHash: "0xdep" }));

vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction, writeContract }) };
});
vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ waitForTransactionReceipt }) };
});
vi.mock("@circle-fin/x402-batching/client", () => ({
  GatewayClient: vi.fn().mockImplementation(() => ({ deposit })),
}));

import { fundSponsored } from "../lib/funding";

beforeEach(() => { sendTransaction.mockClear(); writeContract.mockClear(); deposit.mockClear(); waitForTransactionReceipt.mockClear(); });

describe("fundSponsored", () => {
  it("sends native gas, sends the USDC grant, then deposits to Gateway", async () => {
    const granted = await fundSponsored(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    expect(sendTransaction).toHaveBeenCalledTimes(1);        // native gas
    expect(writeContract).toHaveBeenCalledTimes(1);          // ERC-20 transfer
    expect(writeContract.mock.calls[0][0]).toMatchObject({ functionName: "transfer" });
    expect(deposit).toHaveBeenCalledWith("0.10");            // EOA self-deposit
    expect(granted).toBe(100_000);                           // µUSD
  });
});
