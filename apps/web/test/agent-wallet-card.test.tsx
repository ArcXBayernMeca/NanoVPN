// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let bal: any;
const fund = vi.fn();
const setAmount = vi.fn();
vi.mock("@/lib/use-wallet-balances", () => ({ useWalletBalances: () => bal }));
vi.mock("@/lib/use-fund-wallet", () => ({ useFundWallet: () => ({ amount: "1", setAmount, funding: false, fundErr: null, fund }) }));
import { AgentWalletCard } from "../components/AgentWalletCard";

beforeEach(() => {
  fund.mockClear();
  bal = { walletMicroUsd: 18_088_500, gatewayMicroUsd: 4_062_100, fundedMicroUsd: 4_103_800, eoaAddress: "0xeoa", address: "0x172Bcafe000000000000000000000000000BB02", refresh: async () => {} };
});

describe("AgentWalletCard (light agent-page wallet)", () => {
  it("shows the wallet balance, spending balance, and funded reference", () => {
    render(<AgentWalletCard />);
    expect(screen.getByText(/\$18\.0885/)).toBeTruthy();          // wallet 18_088_500 µUSD
    expect(screen.getByText(/\$4\.0621/)).toBeTruthy();           // spending 4_062_100 µUSD
    expect(screen.getByText(/of \$4\.1038 funded/)).toBeTruthy(); // funded 4_103_800 µUSD
  });

  it("falls back to — / not connected / syncing… on missing values", () => {
    bal = { ...bal, walletMicroUsd: null, gatewayMicroUsd: null, address: null };
    render(<AgentWalletCard />);
    expect(screen.getByText("—")).toBeTruthy();          // wallet value
    expect(screen.getByText("not connected")).toBeTruthy(); // wallet sub, no address
    expect(screen.getByText(/syncing/i)).toBeTruthy();   // spending, EOA present but gateway null
  });

  it("invokes the shared fund flow when Fund is clicked", () => {
    render(<AgentWalletCard />);
    fireEvent.click(screen.getByRole("button", { name: "Fund" }));
    expect(fund).toHaveBeenCalledTimes(1);
  });
});
