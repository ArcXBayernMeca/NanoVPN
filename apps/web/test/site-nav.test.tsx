/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "@/components/SiteNav";

vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/agent" }));

describe("SiteNav", () => {
  it("links to the three surfaces", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /^agent$/i })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /use with agent/i })).toHaveAttribute("href", "/use-with-agent");
    expect(screen.getByRole("link", { name: /map/i })).toHaveAttribute("href", "/map");
  });

  it("marks the active route with aria-current=page", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /^agent$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /map/i })).not.toHaveAttribute("aria-current");
  });
});
