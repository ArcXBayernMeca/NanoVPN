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

  it("default budget is valid against the input's min/step grid (no submit-time stepMismatch)", () => {
    render(<AgentRunForm />);
    const input = screen.getByLabelText(/max budget/i) as HTMLInputElement;
    // The default value must satisfy the input's own constraints — otherwise the
    // browser blocks submit with the cryptic "nearest valid values are …" error.
    expect(input.value).toBe("0.02");
    expect(input.validity.stepMismatch).toBe(false);
    expect(input.validity.rangeUnderflow).toBe(false);
    expect(input.validity.rangeOverflow).toBe(false);
  });
});
