// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WalletPanel } from "../components/WalletPanel";

const writeContractAsync = vi.fn(async () => "0xhash");
const waitForTransactionReceipt = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0xmeta" }),
  useReadContract: () => ({ data: 10_000_000n }), // 10 USDC in the MetaMask wallet
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: 500_000 }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 2_000_000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

describe("WalletPanel", () => {
  it("shows the MetaMask wallet balance and the Gateway spending balance", async () => {
    render(<WalletPanel />);
    expect(screen.getByText(/\$10\.00/)).toBeTruthy();                       // wallet: 10_000_000 µUSD
    await waitFor(() => expect(screen.getByText(/\$0\.50/)).toBeTruthy());    // spending: 500_000 µUSD
  });

  it("shows 'syncing…' when the gateway balance is unavailable", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded", gatewayMicroUsd: null }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByText(/syncing/i)).toBeTruthy());
  });

  it("funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] });
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/self-fund"))).toBe(true));
  });

  it("zero-amount guard: no transfer, shows an error", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.change(document.querySelector(".streampanel__amt") as HTMLInputElement, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    expect(writeContractAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Enter an amount greater than 0/i)).toBeTruthy());
  });

  it("insufficient-balance guard: amount over the wallet balance blocks the transfer", async () => {
    render(<WalletPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fund" })).toBeTruthy());
    fireEvent.change(document.querySelector(".streampanel__amt") as HTMLInputElement, { target: { value: "20" } }); // > 10 USDC wallet
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    expect(writeContractAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Not enough USDC/i)).toBeTruthy());
  });
});
