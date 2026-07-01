// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SavingsBenchmark } from "../components/SavingsBenchmark";

describe("SavingsBenchmark", () => {
  it("shows the saved amount + % and an estimate marker when savings are positive", () => {
    render(<SavingsBenchmark bytes={1_000_000} spentMicroUsd={1000} refUsdPerGb={15} />); // saved 14000 µUSD, 93%
    expect(screen.getByText(/Saved/)).toBeTruthy();
    expect(screen.getByText(/\$0\.0140/)).toBeTruthy();
    expect(screen.getByText(/93%/)).toBeTruthy();
    expect(screen.getByText(/est\.|estimate/i)).toBeTruthy();
  });
  it("shows the detail only (no 'Saved') when the reference is below what was paid", () => {
    render(<SavingsBenchmark bytes={500} spentMicroUsd={1000} refUsdPerGb={15} />); // reference 8 < paid 1000
    expect(screen.queryByText(/Saved/)).toBeNull();
    expect(screen.getByText(/you paid/i)).toBeTruthy();
    expect(screen.getByText(/est\.|estimate/i)).toBeTruthy();
  });
  it("shows 'no savings yet' when there are no bytes or no chosen node", () => {
    const { rerender } = render(<SavingsBenchmark bytes={0} spentMicroUsd={1000} refUsdPerGb={15} />);
    expect(screen.getByText(/no savings yet/i)).toBeTruthy();
    rerender(<SavingsBenchmark bytes={1_000_000} spentMicroUsd={1000} refUsdPerGb={null} />);
    expect(screen.getByText(/no savings yet/i)).toBeTruthy();
  });
});
