// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const row = {
  id: "s1", settlement_uuid: "u1", amount_micro_usd: 11309, status: "received", tx_hash: null,
  payer: "0xb43cbda374e3cd2a3d67827683f81462bacf703b", payee: "0xbad0e18452f7f5f1f4f1fd8e6bcc24a28a5b94dc", network: "eip155:5042002",
};
vi.mock("@/lib/supabase", () => ({
  supabaseBrowser: () => ({
    channel: () => ({ on() { return this; }, subscribe(cb: any) { cb?.("SUBSCRIBED"); return this; } }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [row] }) }) }) }),
  }),
}));

import { SettlementLog } from "@/components/SettlementLog";

describe("SettlementLog", () => {
  it("renders the verified proof badge and a payer wallet anchor", async () => {
    render(<SettlementLog sessionId="x" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /verified/i })).toBeInTheDocument());
    const anchor = screen.getByRole("link", { name: /payer wallet on arc/i });
    expect(anchor.getAttribute("href")).toContain(row.payer);
  });
});
