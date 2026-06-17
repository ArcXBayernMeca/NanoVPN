import { microUsdForBytes, shouldSettle } from "@nanovpn/core";

export class Meter {
  totalBytes = 0;
  spentMicroUsd = 0;
  settledMicroUsd = 0;
  lastSettleAt = Date.now();

  constructor(private readonly pricePerGbUsd: number) {}

  addBytes(n: number) {
    if (n <= 0) return;
    this.totalBytes += n;
    this.spentMicroUsd += microUsdForBytes(n, this.pricePerGbUsd);
  }

  unsettledMicroUsd() {
    return Math.max(0, this.spentMicroUsd - this.settledMicroUsd);
  }

  markSettled(amountMicroUsd: number) {
    this.settledMicroUsd += amountMicroUsd;
    this.lastSettleAt = Date.now();
  }

  due(now: number) {
    return shouldSettle(this.unsettledMicroUsd(), now - this.lastSettleAt);
  }
}
