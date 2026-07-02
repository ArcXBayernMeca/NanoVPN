// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockState: any;
vi.mock("@/lib/use-wallet-balances", () => ({ useWalletBalances: () => mockState }));
import { WalletBalances } from "../components/WalletBalances";

beforeEach(() => { mockState = { walletMicroUsd: 4_000_000, gatewayMicroUsd: 500_000, fundedMicroUsd: 1_000_000, eoaAddress: "0xeoa", address: "0xmeta", refresh: async () => {} }; });

describe("WalletBalances", () => {
  it("shows the wallet + spending balances", () => {
    render(<WalletBalances />);
    expect(screen.getByText(/\$4\.00/)).toBeTruthy();   // wallet 4_000_000 µUSD
    expect(screen.getByText(/\$0\.50/)).toBeTruthy();   // spending 500_000 µUSD
  });
  it("falls back to — and a syncing skeleton on nulls", () => {
    mockState = { ...mockState, walletMicroUsd: null, gatewayMicroUsd: null };
    const { container } = render(<WalletBalances />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/syncing/i)).toBeTruthy();          // sr-only text stays for a11y + tests
    expect(container.querySelector(".skeleton")).toBeTruthy();  // visual shimmer present
  });
});
