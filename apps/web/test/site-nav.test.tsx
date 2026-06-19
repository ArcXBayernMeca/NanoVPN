/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteNav } from "@/components/SiteNav";

describe("SiteNav", () => {
  it("links to the three surfaces", () => {
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: /agent/i })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: /developers/i })).toHaveAttribute("href", "/developers");
    expect(screen.getByRole("link", { name: /map/i })).toHaveAttribute("href", "/");
  });
});
