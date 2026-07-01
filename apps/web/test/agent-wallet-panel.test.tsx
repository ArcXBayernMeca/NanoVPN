// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let signedIn: string | null = "0xabc";
vi.mock("@/components/WalletProvider", () => ({ useWallet: () => ({ signedIn }) }));
vi.mock("@/components/WalletPanel", () => ({ WalletPanel: () => <div>wallet-panel</div> }));
import { AgentWalletPanel } from "../components/AgentWalletPanel";

describe("AgentWalletPanel", () => {
  it("renders the WalletPanel when signed in", () => {
    signedIn = "0xabc";
    render(<AgentWalletPanel />);
    expect(screen.getByText("wallet-panel")).toBeTruthy();
  });
  it("renders nothing when not signed in", () => {
    signedIn = null;
    const { container } = render(<AgentWalletPanel />);
    expect(container.textContent).toBe("");
  });
});
