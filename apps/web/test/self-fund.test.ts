// apps/web/test/self-fund.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const readContract = vi.fn();
const getBalance = vi.fn();
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
const sendTransaction = vi.fn(async () => "0xgas");
const deposit = vi.fn(async () => ({ depositTxHash: "0xdep" }));

vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ readContract, getBalance, waitForTransactionReceipt }) };
});
vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction }) };
});
vi.mock("@circle-fin/x402-batching/client", () => ({ GatewayClient: vi.fn().mockImplementation(() => ({ deposit })) }));

import { depositOwnBalance } from "../lib/self-fund";
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => { vi.clearAllMocks(); });

describe("depositOwnBalance", () => {
  it("returns 0 and deposits nothing when the EOA holds no USDC", async () => {
    readContract.mockResolvedValue(0n);
    expect(await depositOwnBalance(KEY)).toBe(0);
    expect(deposit).not.toHaveBeenCalled();
  });

  it("sponsors gas (native low) then deposits the balance, returns µUSD", async () => {
    readContract.mockResolvedValue(1_000_000n); // $1 USDC (6 dec)
    getBalance.mockResolvedValue(0n);           // no native → sponsor gas
    const deposited = await depositOwnBalance(KEY);
    expect(sendTransaction).toHaveBeenCalledTimes(1);     // gas sponsored
    expect(deposit).toHaveBeenCalledWith("1");            // formatUnits(1_000_000n, 6)
    expect(deposited).toBe(1_000_000);
  });

  it("skips gas when the EOA already has native", async () => {
    readContract.mockResolvedValue(500_000n);
    getBalance.mockResolvedValue(10n ** 18n);   // plenty of native
    await depositOwnBalance(KEY);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(deposit).toHaveBeenCalledWith("0.5");
  });
});
