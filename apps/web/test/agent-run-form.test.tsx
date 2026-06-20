// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { AgentRunForm } from "@/components/AgentRunForm";

describe("AgentRunForm", () => {
  it("renders the goal input and a run button", () => {
    render(<AgentRunForm />);
    expect(screen.getByPlaceholderText(/goal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run agent/i })).toBeInTheDocument();
  });
  it("has no node dropdown (the agent picks)", () => {
    const { container } = render(<AgentRunForm />);
    expect(container.querySelector("select")).toBeNull();
  });
});
