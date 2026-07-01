"use client";
import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";
import { useWalletBalances } from "@/lib/use-wallet-balances";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function WalletPanel() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { walletMicroUsd, gatewayMicroUsd, fundedMicroUsd, eoaAddress, address, refresh } = useWalletBalances();

  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function fund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!eoaAddress || !publicClient) return;
    const wei = parseUnits(amount, ARC.usdcDecimals);
    if (walletMicroUsd != null && wei > BigInt(walletMicroUsd)) { setFundErr("Not enough USDC in your wallet"); return; }
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [eoaAddress as `0x${string}`, wei],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const r = await fetch("/api/self-fund", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setFundErr(d.error ?? "self-fund failed"); return; }
      await refresh();
    } catch (e) { setFundErr((e as Error).message); } finally { setFunding(false); }
  }

  return (
    <div className="walletpanel">
      <p className="streampanel__bal">Wallet{" "}
        {walletMicroUsd != null
          ? <><strong>{formatUsd(walletMicroUsd)}</strong> <span className="streampanel__sub">{short(address)}</span></>
          : <span className="streampanel__sub">—</span>}
      </p>
      {eoaAddress != null && (
        <p className="streampanel__bal">Spending balance{" "}
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
