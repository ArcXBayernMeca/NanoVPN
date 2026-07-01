"use client";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";
import { useFundWallet } from "@/lib/use-fund-wallet";

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/**
 * Light-themed wallet card for the top of the agent page: MetaMask wallet
 * balance + Gateway spending balance as two stat tiles, plus a compact top-up
 * row. (The map page's dark WalletPanel stays as-is — this one is styled for
 * the agent page's cream/white surface.)
 */
export function AgentWalletCard() {
  const { walletMicroUsd, gatewayMicroUsd, fundedMicroUsd, eoaAddress, address, refresh } = useWalletBalances();
  const { amount, setAmount, funding, fundErr, fund } = useFundWallet({ eoaAddress, walletMicroUsd, refresh });

  return (
    <section className="awallet">
      <span className="eyebrow">Your wallet</span>
      <div className="awallet__grid">
        <div className="awallet__stat">
          <span className="awallet__k">Wallet balance</span>
          <b className="awallet__v">{walletMicroUsd != null ? formatUsd(walletMicroUsd) : "—"}</b>
          <span className="awallet__sub">{address ? short(address) : "not connected"}</span>
        </div>
        <div className="awallet__stat">
          <span className="awallet__k">Gateway balance</span>
          <b className="awallet__v">{gatewayMicroUsd != null ? formatUsd(gatewayMicroUsd) : eoaAddress ? "syncing…" : "—"}</b>
          <span className="awallet__sub">{eoaAddress != null ? `of ${formatUsd(fundedMicroUsd ?? 0)} funded` : "spending wallet"}</span>
        </div>
      </div>
      <div className="awallet__fund">
        <label className="awallet__fundlabel" htmlFor="awallet-amt">Top up spending <span>(USDC)</span></label>
        <div className="awallet__fundrow">
          <div className="awallet__amtwrap">
            <span className="awallet__amtcur">$</span>
            <input id="awallet-amt" className="awallet__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top up amount" />
          </div>
          <button className="btn btn--primary awallet__fundbtn" disabled={funding || !eoaAddress} onClick={fund}>
            {funding ? "Funding…" : "Fund"}
          </button>
        </div>
        {fundErr && <p className="awallet__warn">{fundErr}</p>}
      </div>
    </section>
  );
}
