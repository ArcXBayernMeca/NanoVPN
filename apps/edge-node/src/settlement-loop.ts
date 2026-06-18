import type { SessionRegistry } from "./sessions";

export interface BuyerClient { pay(url: string): Promise<unknown>; }

export async function runSettlementTick(
  registry: SessionRegistry, buyer: BuyerClient, settleBaseUrl: string, now: number,
): Promise<string[]> {
  const due = registry.list().filter((e) => e.status === "active" && !e.settling && e.meter.due(now));
  await Promise.all(
    due.map((e) => {
      e.settling = true;
      return buyer
        .pay(`${settleBaseUrl}?session=${e.id}`)
        .catch((err) =>
          console.error(`[settlement] session ${e.id} pay failed:`, (err as Error).message),
        )
        .finally(() => { e.settling = false; });
    }),
  );
  return due.map((e) => e.id);
}

export function startSettlementLoop(
  registry: SessionRegistry, buyer: BuyerClient, settleBaseUrl: string, intervalMs = 2000,
) {
  const handle = setInterval(() => { void runSettlementTick(registry, buyer, settleBaseUrl, Date.now()); }, intervalMs);
  return () => clearInterval(handle);
}
