// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettlementProof } from "@/components/SettlementProof";

afterEach(() => vi.unstubAllGlobals());

describe("SettlementProof", () => {
  it("shows the verified badge and reveals facilitator details on expand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ from: "0xaaaa000000000000000000000000000000000001", to: "0xbbbb000000000000000000000000000000000002", status: "completed", network: "eip155:5042002" }),
    })));
    render(<SettlementProof uuid="u1" amountMicroUsd={11309} />);
    const badge = screen.getByRole("button", { name: /verified/i });
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);
    await waitFor(() => expect(screen.getByText(/completed/i)).toBeInTheDocument());
    expect(screen.getByText(/Arc \(eip155:5042002\)/i)).toBeInTheDocument();
    expect(screen.getByText("$0.0113")).toBeInTheDocument();
  });

  it("falls back to provided payer/payee if the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    render(<SettlementProof uuid="u1" amountMicroUsd={5000} payer="0x1111000000000000000000000000000000000011" payee="0x2222000000000000000000000000000000000022" />);
    fireEvent.click(screen.getByRole("button", { name: /verified/i }));
    await waitFor(() => expect(screen.getByText(/0x1111…0011 → 0x2222…0022/)).toBeInTheDocument());
  });
});
