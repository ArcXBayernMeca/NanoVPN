import type { ServerResponse } from "node:http";
import type { UsageTick } from "@nanovpn/core";
import type { SessionRegistry } from "./sessions";

export const sseFrame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

export function usageTick(registry: SessionRegistry, sessionId: string): UsageTick | null {
  const e = registry.getById(sessionId);
  if (!e) return null;
  return {
    sessionId,
    totalBytes: e.meter.totalBytes,
    spentMicroUsd: e.meter.spentMicroUsd,
    unsettledMicroUsd: e.meter.unsettledMicroUsd(),
    ts: Date.now(),
  };
}

export function streamUsage(res: ServerResponse, registry: SessionRegistry, sessionId: string, periodMs = 500) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  const timer = setInterval(() => {
    const tick = usageTick(registry, sessionId);
    if (tick) res.write(sseFrame(tick));
  }, periodMs);
  res.on("close", () => clearInterval(timer));
}
