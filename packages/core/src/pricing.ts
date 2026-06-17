// µUSD == atomic USDC (6 decimals). 1 atomic unit = $0.000001.
export const SETTLE_THRESHOLD_MICRO_USD = 10_000; // $0.01
export const SETTLE_INTERVAL_MS = 10_000;         // ~10s

/** bytes × ($/GB) → integer µUSD. atomic = bytes × pricePerGbUsd / 1000 (since 1e6/1e9 = 1/1000). */
export function microUsdForBytes(bytes: number, pricePerGbUsd: number): number {
  return Math.round((bytes * pricePerGbUsd) / 1000);
}

export function shouldSettle(unsettledMicroUsd: number, msSinceLastSettle: number): boolean {
  if (unsettledMicroUsd <= 0) return false;
  return unsettledMicroUsd >= SETTLE_THRESHOLD_MICRO_USD || msSinceLastSettle >= SETTLE_INTERVAL_MS;
}
