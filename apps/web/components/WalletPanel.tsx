"use client";
import { useAccount } from "wagmi";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";
import { useFundWallet } from "@/lib/use-fund-wallet";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function WalletPanel() {
  const { isConnected } = useAccount();
  const { walletMicroUsd, gatewayMicroUsd, fundedMicroUsd, eoaAddress, address, refresh } = useWalletBalances();
  const { amount, setAmount, funding, fundErr, fund } = useFundWallet({ eoaAddress, walletMicroUsd, refresh });

  return (
    <div className="walletpanel">
      <p className="streampanel__bal">Wallet{" "}
        {walletMicroUsd != null
          ? <><strong>{formatUsd(walletMicroUsd)}</strong> <span className="streampanel__sub">{short(address)}</span></>
          : <span className="streampanel__sub">—</span>}
      </p>
      {eoaAddress != null && (
        <p className="streampanel__bal">Gateway balance{" "}
          {gatewayMicroUsd == null
            ? <span className="streampanel__sub">syncing…</span>
            : <><strong>{formatUsd(gatewayMicroUsd)}</strong> <span className="streampanel__sub">of {formatUsd(fundedMicroUsd ?? 0)} funded</span></>}
        </p>
      )}
      <div className="streampanel__fund">
        <span className="streampanel__sub">Top up your spending wallet (USDC)</span>
        <div className="streampanel__fundrow">
          <div className="streampanel__amtwrap">
            <span className="streampanel__amtcur">$</span>
            <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top up amount" />
          </div>
          <button className="btn btn--secondary streampanel__fundbtn" disabled={funding || !isConnected || !eoaAddress} onClick={fund}>
            {funding ? "Funding…" : "Fund"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>
    </div>
  );
}
