// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentRunForm } from "@/components/AgentRunForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("AgentRunForm", () => {
  it("renders goal + a labeled budget and NO mock checkbox", () => {
    render(<AgentRunForm />);
    expect(screen.getByPlaceholderText(/goal/i)).toBeTruthy();
    expect(screen.getByLabelText(/max budget/i)).toBeTruthy();
    expect(screen.queryByText(/mock/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
