// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FetchPanel } from "../components/FetchPanel";

vi.mock("../components/SettlementLog", () => ({ SettlementLog: ({ sessionId }: any) => <div>tape:{sessionId}</div> }));

const node = { id: "tokyo-1", geo: { country: "Japan", city: "Tokyo", lat: 35, lng: 139 }, pricePerGbUsd: 2.5 } as any;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async (input: any) => {
    const u = String(input);
    if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "1.2.3.4", geo: { city: "London", country: "United Kingdom" }, region: "nrt", regionVerified: true, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as any;
});

const noop = () => {};

describe("FetchPanel streaming", () => {
  it("streams when `streaming` is on: ticks /api/egress and accumulates the counter + egress + tape", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(true));
    await waitFor(() => expect(screen.getByText(/1\.2\.3\.4/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/0\.26 MB/)).toBeTruthy());
    expect(screen.getByText(/tape:sess-1/)).toBeTruthy();
  });

  it("does not stream when `streaming` is off", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    expect(screen.getByText(/STREAMING SPEND/)).toBeTruthy(); // mounted
    expect((global.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/api/egress"))).toBe(false);
  });

  it("shows the ✓ verified badge when the egress tick is region-verified", async () => {
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/verified/i)).toBeTruthy());
  });

  it("shows the actual region honestly (no ✓) when a tick is not region-verified", async () => {
    global.fetch = vi.fn(async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/egress")) return new Response(JSON.stringify({ sessionId: "sess-1", status: 200, bytes: 262144, egressIp: "9.9.9.9", geo: { city: "Tokyo", country: "Japan" }, region: "lhr", regionVerified: false, transaction: "uuid-1", amountMicroUsd: 655 }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as any;
    render(<FetchPanel node={node} streaming={true} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    await waitFor(() => expect(screen.getByText(/London/)).toBeTruthy());
    expect(screen.queryByText(/verified/i)).toBeNull();
  });

  it("no longer renders a Balance line or Fund button (moved to WalletPanel)", async () => {
    render(<FetchPanel node={node} streaming={false} intensity={"medium"} onToggleStream={noop} onIntensity={noop} />);
    expect(screen.queryByRole("button", { name: "Fund" })).toBeNull();
    expect(screen.queryByText(/of \$.* funded/)).toBeNull();
  });
});
