"use client";
import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";

/**
 * Shared "top up the spending wallet" flow: MetaMask transfer of USDC to the
 * user's spending EOA, then POST /api/self-fund to deposit it into Gateway.
 * Used by both the map's dark WalletPanel and the agent page's light card so
 * the guards + on-chain flow live in exactly one place.
 */
export function useFundWallet(opts: {
  eoaAddress: string | null;
  walletMicroUsd: number | null;
  refresh: () => Promise<void>;
}) {
  const { eoaAddress, walletMicroUsd, refresh } = opts;
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

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

  return { amount, setAmount, funding, fundErr, fund };
}
