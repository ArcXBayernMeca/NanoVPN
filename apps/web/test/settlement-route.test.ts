import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/settlement/[uuid]/route";

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/settlement/[uuid]", () => {
  it("maps the facilitator transfer record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ fromAddress: "0xa", toAddress: "0xb", amount: "11309", status: "completed", sendingNetwork: "eip155:5042002" }),
    })));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ uuid: "u1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "0xa", to: "0xb", amount: "11309", status: "completed", network: "eip155:5042002" });
  });

  it("returns 502 when the facilitator errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ uuid: "u1" }) });
    expect(res.status).toBe(502);
  });
});
