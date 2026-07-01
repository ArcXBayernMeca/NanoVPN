import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SPONSOR_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const readContract = vi.fn();
const getBalance = vi.fn();
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const }));
const sendTransaction = vi.fn(async () => "0xgas");
const writeContract = vi.fn(async () => "0xtx");

vi.mock("@nanovpn/core", async (orig) => {
  const actual = await orig<typeof import("@nanovpn/core")>();
  return { ...actual, arcPublicClient: () => ({ readContract, getBalance, waitForTransactionReceipt }) };
});
vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return { ...actual, createWalletClient: () => ({ sendTransaction, writeContract }) };
});

import { depositOwnBalance } from "../lib/self-fund";
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => {
  vi.clearAllMocks();
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("depositOwnBalance", () => {
  it("returns 0 and deposits nothing when the EOA holds no USDC", async () => {
    readContract.mockResolvedValue(0n);
    expect(await depositOwnBalance(KEY)).toBe(0);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("sponsors gas (native low), approves + deposits with the reference gas caps, returns µUSD", async () => {
    readContract.mockResolvedValue(1_000_000n); // $1 USDC
    getBalance.mockResolvedValue(0n);           // no native → sponsor gas
    const deposited = await depositOwnBalance(KEY);
    expect(sendTransaction).toHaveBeenCalledTimes(1);            // gas sponsored
    expect(writeContract).toHaveBeenCalledTimes(2);              // approve + deposit
    expect(writeContract.mock.calls[0][0]).toMatchObject({ functionName: "approve", gas: 120_000n });
    expect(writeContract.mock.calls[1][0]).toMatchObject({ functionName: "deposit", gas: 350_000n });
    expect(deposited).toBe(1_000_000);
  });

  it("skips gas when the EOA already has native", async () => {
    readContract.mockResolvedValue(500_000n);
    getBalance.mockResolvedValue(10n ** 18n);
    await depositOwnBalance(KEY);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(writeContract).toHaveBeenCalledTimes(2);
  });

  it("throws when a deposit receipt is not success (credit nothing)", async () => {
    readContract.mockResolvedValue(1_000_000n);
    getBalance.mockResolvedValue(10n ** 18n);
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    await expect(depositOwnBalance(KEY)).rejects.toThrow(/deposit transaction failed/);
  });
});
