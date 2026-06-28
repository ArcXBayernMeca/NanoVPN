// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerRequestUsd: 0.001 } as any;

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 500_000, spentMicroUsd: 0 }), { status: 200 });
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4", geo: node.geo, transaction: "uuid-1", amountMicroUsd: 1000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

describe("FetchPanel", () => {
  it("shows balance, fetches through the node, and renders the result + tape", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getAllByText(/0\.50/).length).toBeGreaterThan(0)); // funded balance
    fireEvent.click(screen.getByRole("button", { name: /Fetch through Tokyo/i }));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy()); // egress IP in result
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();                    // SettlementLog wired with the session
  });
});
