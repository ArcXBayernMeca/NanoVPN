// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let signedIn: string | null = "0xabc";
vi.mock("@/components/WalletProvider", () => ({ useWallet: () => ({ signedIn }) }));
vi.mock("@/components/AgentWalletCard", () => ({ AgentWalletCard: () => <div>wallet-card</div> }));
import { AgentWalletPanel } from "../components/AgentWalletPanel";

describe("AgentWalletPanel", () => {
  it("renders the wallet card when signed in", () => {
    signedIn = "0xabc";
    render(<AgentWalletPanel />);
    expect(screen.getByText("wallet-card")).toBeTruthy();
  });
  it("renders nothing when not signed in", () => {
    signedIn = null;
    const { container } = render(<AgentWalletPanel />);
    expect(container.textContent).toBe("");
  });
});
