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

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerGbUsd: 2.5 } as any;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/wallet")) return new Response(JSON.stringify({ eoaAddress: "0xeoa", fundedMicroUsd: 1_000_000, spentMicroUsd: 0, fundingStatus: "funded" }), { status: 200 });
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "1.2.3.4", geo: { city: "London", country: "United Kingdom" }, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
    if (u.endsWith("/api/self-fund")) return new Response(JSON.stringify({ depositedMicroUsd: 1_000_000, fundedMicroUsd: 2_000_000 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

const noop = () => {};

describe("FetchPanel streaming", () => {
  it("streams when `streaming` is on: ticks /api/egress and accumulates the counter + egress + tape", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy());           // egress IP shown
    await waitFor(() => expect(screen.getByText(/0\.26 MB/)).toBeTruthy());             // 262144 bytes ≈ 0.26 MB
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();
  });

  it("does not stream when `streaming` is off", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/wallet"))).toBe(true));
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(false);
  });

  it("self-funds: transfers USDC to the spending EOA then posts /api/self-fund", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Fund from your wallet/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Fund from your wallet/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalled());
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ functionName: "transfer", args: ["0xeoa", 1_000_000n] });
  });
});
