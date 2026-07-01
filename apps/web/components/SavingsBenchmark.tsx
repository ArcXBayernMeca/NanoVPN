"use client";
import { residentialSavings, RESIDENTIAL_MARKUP } from "@nanovpn/core";
import { formatUsd } from "./format";

/** Cumulative "money saved vs a residential proxy" for the run — an illustrative estimate, not a quote. */
export function SavingsBenchmark({ bytes, spentMicroUsd, refUsdPerGb }: { bytes: number; spentMicroUsd: number; refUsdPerGb: number | null }) {
  if (bytes <= 0 || refUsdPerGb == null) {
    return (
      <div className="savings">
        <span className="eyebrow">Money saved</span>
        <p className="savings__none">No savings yet</p>
      </div>
    );
  }
  const { referenceMicroUsd, savedMicroUsd, pct } = residentialSavings(bytes, spentMicroUsd, refUsdPerGb);
  const meteredPerGb = (refUsdPerGb / RESIDENTIAL_MARKUP).toFixed(1);
  return (
    <div className="savings">
      <span className="eyebrow">Money saved</span>
      {savedMicroUsd > 0 && <p className="savings__amount">Saved <strong>{formatUsd(savedMicroUsd)}</strong> ({pct}%)</p>}
      <p className="savings__detail">you paid {formatUsd(spentMicroUsd)} · vs residential proxy ≈ {formatUsd(referenceMicroUsd)}</p>
      <p className="savings__note">est. — residential proxy ≈ ${refUsdPerGb.toFixed(0)}/GB (~{RESIDENTIAL_MARKUP}× a ${meteredPerGb}/GB metered rate)</p>
    </div>
  );
}
