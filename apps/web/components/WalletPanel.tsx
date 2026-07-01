"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";
import { formatUsd } from "./format";

type Wallet = { eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string; gatewayMicroUsd: number | null };
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // MetaMask wallet's Arc USDC (6-dec ERC-20). Pinned to Arc so a wrong-network wallet reads "—".
  const { data: walletBal } = useReadContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: ARC.chainId,
    query: { enabled: !!address },
  });

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const [fundErr, setFundErr] = useState<string | null>(null);

  async function refresh() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setWallet(d);
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000); // keep the spending balance honest as streaming drains it
    return () => clearInterval(id);
  }, []);

  async function fund() {
    if (!(Number(amount) > 0)) { setFundErr("Enter an amount greater than 0"); return; }
    if (!wallet || !publicClient) return;
    const wei = parseUnits(amount, ARC.usdcDecimals);
    if (walletBal != null && wei > (walletBal as bigint)) { setFundErr("Not enough USDC in your wallet"); return; }
    setFunding(true); setFundErr(null);
    try {
      const hash = await writeContractAsync({
        address: ARC.usdc, abi: erc20Abi, functionName: "transfer",
        args: [wallet.eoaAddress as `0x${string}`, wei],
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
        {walletBal != null
          ? <><strong>{formatUsd(Number(walletBal))}</strong> <span className="streampanel__sub">{short(address)}</span></>
          : <span className="streampanel__sub">—</span>}
      </p>
      {wallet && (
        <p className="streampanel__bal">Spending balance{" "}
          {wallet.gatewayMicroUsd == null
            ? <span className="streampanel__sub">syncing…</span>
            : <><strong>{formatUsd(wallet.gatewayMicroUsd)}</strong> <span className="streampanel__sub">of {formatUsd(wallet.fundedMicroUsd)} funded</span></>}
        </p>
      )}
      <div className="streampanel__fund">
        <span className="streampanel__sub">Top up your spending wallet (USDC)</span>
        <div className="streampanel__fundrow">
          <div className="streampanel__amtwrap">
            <span className="streampanel__amtcur">$</span>
            <input className="streampanel__amt" type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top up amount" />
          </div>
          <button className="btn btn--secondary streampanel__fundbtn" disabled={funding || !isConnected || !wallet} onClick={fund}>
            {funding ? "Funding…" : "Fund"}
          </button>
        </div>
        {fundErr && <p className="streampanel__warn">{fundErr}</p>}
      </div>
    </div>
  );
}
