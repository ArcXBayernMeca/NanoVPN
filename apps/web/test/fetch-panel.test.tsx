// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));

const writeContractAsync = vi.fn(async () => "0xhash");
const waitForTransactionReceipt = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0xmeta" }),
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerRequestUsd: 0.001 } as any;

beforeEach(() => {
  vi.restoreAllMocks();
  writeContractAsync.mockClear();
  waitForTransactionReceipt.mockClear();
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 100_000, spentMicroUsd: 0, fundingStatus: "funded" }), { status: 200 });
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 42, egressIp: "1.2.3.4", geo: node.geo, transaction: "uuid-1", amountMicroUsd: 1000 }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 1_100_000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

describe("FetchPanel", () => {
  it("shows balance, fetches through the node, and renders the result + tape", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getAllByText(/0\.10/).length).toBeGreaterThan(0)); // funded balance $0.10
    fireEvent.click(screen.getByRole("button", { name: /Fetch through Tokyo/i }));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy()); // egress IP in result
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();                    // SettlementLog wired with the session
  });

  it("rejects a zero amount: shows error and never calls writeContractAsync", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Fund from your wallet/i })).toBeTruthy());
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Fund from your wallet/i }));
    await waitFor(() => expect(screen.getByText(/Enter an amount greater than 0/i)).toBeTruthy());
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it("self-funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<FetchPanel node={node} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Fund from your wallet/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Fund from your wallet/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] }); // parseUnits("1",6)
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/self-fund"))).toBe(true));
  });
});
