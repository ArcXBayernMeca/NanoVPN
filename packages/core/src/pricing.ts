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

/** Flat per-request price ($) → integer µUSD (atomic USDC, 6 dec). */
export function microUsdForRequest(pricePerRequestUsd: number): number {
  return Math.round(pricePerRequestUsd * 1_000_000);
}

// Illustrative markup: a residential proxy runs ~this many times a metered geo rate. Used ONLY to
// estimate "what you'd pay without NanoVPN" for the savings benchmark — never a quoted vendor price.
export const RESIDENTIAL_MARKUP = 5;

/**
 * Estimated savings vs a residential proxy, all in µUSD:
 *   reference = the fetched bytes priced at refUsdPerGb; saved = reference − what was paid.
 * `savedMicroUsd` may be negative (tiny fetches); the caller decides how to present it.
 */
export function residentialSavings(bytes: number, paidMicroUsd: number, refUsdPerGb: number): { referenceMicroUsd: number; savedMicroUsd: number; pct: number } {
  if (bytes <= 0) return { referenceMicroUsd: 0, savedMicroUsd: 0, pct: 0 };
  const referenceMicroUsd = microUsdForBytes(bytes, refUsdPerGb);
  const savedMicroUsd = referenceMicroUsd - paidMicroUsd;
  const pct = referenceMicroUsd > 0 ? Math.round((savedMicroUsd / referenceMicroUsd) * 100) : 0;
  return { referenceMicroUsd, savedMicroUsd, pct };
}
