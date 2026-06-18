import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { ProxyAgent, request as undiciRequest } from "undici";
import { SessionRegistry } from "../src/sessions";
import { handleConnect } from "../src/proxy";

let target: http.Server, proxy: http.Server, tPort: number, pPort: number;
const registry = new SessionRegistry();

beforeAll(async () => {
  target = http.createServer((_q, s) => s.end("y".repeat(20_000)));
  await new Promise<void>((r) => target.listen(0, () => r())); tPort = (target.address() as any).port;
  proxy = http.createServer();
  proxy.on("connect", (q, sock, head) => handleConnect(q, sock as any, head, registry));
  await new Promise<void>((r) => proxy.listen(0, () => r())); pPort = (proxy.address() as any).port;
  registry.register({ id: "s1", token: "tok", nodeId: "tokyo-1", pricePerGbUsd: 3, budgetMicroUsd: 1_000_000 });
});
afterAll(() => { target.close(); proxy.close(); });

it("meters bytes for a real proxied request", async () => {
  const auth = Buffer.from("tok:").toString("base64");
  const agent = new ProxyAgent({ uri: `http://localhost:${pPort}`, token: `Basic ${auth}` });
  const r = await undiciRequest(`http://localhost:${tPort}/`, { dispatcher: agent });
  await r.body.arrayBuffer();
  expect(registry.getById("s1")!.meter.totalBytes).toBeGreaterThan(20_000 - 1);
  expect(registry.getById("s1")!.meter.spentMicroUsd).toBeGreaterThan(0);
});
