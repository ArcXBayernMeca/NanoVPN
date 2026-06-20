/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "@/components/SiteNav";

// WalletButton uses useWallet() which requires WalletProvider; mock it out for the nav test.
vi.mock("@/components/WalletButton", () => ({
  WalletButton: () => <button>Connect wallet</button>,
}));

describe("SiteNav", () => {
  it("links to the three surfaces", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /^agent$/i })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /use with agent/i })).toHaveAttribute("href", "/use-with-agent");
    expect(screen.getByRole("link", { name: /map/i })).toHaveAttribute("href", "/");
  });
});
