"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { ARC } from "@nanovpn/core";

type ApiWallet = { eoaAddress: string; fundedMicroUsd: number; spentMicroUsd: number; fundingStatus: string; gatewayMicroUsd: number | null };
export interface WalletBalances {
  walletMicroUsd: number | null;
  gatewayMicroUsd: number | null;
  fundedMicroUsd: number | null;
  eoaAddress: string | null;
  address: `0x${string}` | undefined;
  refresh: () => Promise<void>;
}

/** MetaMask USDC (6-dec ERC-20, Arc-pinned) + /api/wallet (gateway/funded/eoa) on mount + a 15s poll. */
export function useWalletBalances(): WalletBalances {
  const { address } = useAccount();
  const { data: walletBal } = useReadContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: ARC.chainId,
    query: { enabled: !!address },
  });
  const [wallet, setWallet] = useState<ApiWallet | null>(null);

  async function refresh() {
    const d = await fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setWallet(d);
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  return {
    walletMicroUsd: walletBal != null ? Number(walletBal) : null,
    gatewayMicroUsd: wallet ? wallet.gatewayMicroUsd : null,
    fundedMicroUsd: wallet ? wallet.fundedMicroUsd : null,
    eoaAddress: wallet ? wallet.eoaAddress : null,
    address,
    refresh,
  };
}
