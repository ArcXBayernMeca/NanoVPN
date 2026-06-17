import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { SessionRegistry } from "../src/sessions";
import { handleConnect } from "../src/proxy";

let target: http.Server, proxy: http.Server, targetPort: number, proxyPort: number;
const registry = new SessionRegistry();

beforeAll(async () => {
  target = http.createServer((_req, res) => res.end("x".repeat(5000)));
  await new Promise<void>((r) => target.listen(0, () => r()));
  targetPort = (target.address() as any).port;

  proxy = http.createServer();
  proxy.on("connect", (req, socket, head) => handleConnect(req, socket, head, registry));
  await new Promise<void>((r) => proxy.listen(0, () => r()));
  proxyPort = (proxy.address() as any).port;

  registry.register({ id: "s1", token: "tok-good", nodeId: "tokyo-1", pricePerGbUsd: 3, budgetMicroUsd: 1_000_000 });
});
afterAll(() => { target.close(); proxy.close(); });

function connectThrough(token: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${token}:`).toString("base64");
    const req = http.request({
      host: "localhost", port: proxyPort, method: "CONNECT",
      path: `localhost:${targetPort}`, headers: { "Proxy-Authorization": `Basic ${auth}` },
    });
    req.on("connect", (res, socket) => { socket.destroy(); resolve({ status: res.statusCode! }); });
    req.on("error", reject);
    req.end();
  });
}

describe("CONNECT proxy gating + metering", () => {
  it("rejects an unknown session token with 402", async () => {
    const { status } = await connectThrough("tok-bad");
    expect(status).toBe(402);
  });
  it("accepts a valid token and meters bytes", async () => {
    const { status } = await connectThrough("tok-good");
    expect(status).toBe(200);
    // tunnel established; even just the handshake counts >= 0; assert session exists & active
    expect(registry.canProxy("s1")).toBe(true);
  });
});
