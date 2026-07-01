import "server-only";
import { createWalletClient, http, parseEther, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";
const MIN_NATIVE = parseEther("0.02"); // sponsor gas if the EOA has less than this

// Gas caps from Circle's deposit-evm reference (avoid overestimating / hitting max tx gas).
const APPROVE_GAS = 120_000n;
const DEPOSIT_GAS = 350_000n;

// Gateway Wallet deposit(token, value) — from Circle's deposit-evm reference.
const GATEWAY_WALLET_DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/**
 * Deposit the EOA's current USDC balance into Gateway via an explicit approve + deposit
 * (Circle deposit-evm pattern + gas caps). Waits for both receipts; THROWS if either is not
 * `success`. Sponsors a little native gas if the EOA is low. Returns confirmed µUSD (0 if none).
 */
export async function depositOwnBalance(eoaPrivateKey: Hex): Promise<number> {
  const eoa = privateKeyToAccount(eoaPrivateKey);
  const pub = arcPublicClient();
  const balance = (await pub.readContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "balanceOf", args: [eoa.address],
  })) as bigint;
  if (balance === 0n) return 0;

  const native = await pub.getBalance({ address: eoa.address });
  if (native < MIN_NATIVE) {
    const sponsor = createWalletClient({ account: privateKeyToAccount(sponsorKey()), chain: arcTestnet, transport: http(ARC.rpcUrl) });
    const gasTx = await sponsor.sendTransaction({ to: eoa.address, value: parseEther(GAS_NATIVE) });
    await pub.waitForTransactionReceipt({ hash: gasTx });
  }

  const wallet = createWalletClient({ account: eoa, chain: arcTestnet, transport: http(ARC.rpcUrl) });

  const approveTx = await wallet.writeContract({
    address: ARC.usdc, abi: erc20Abi, functionName: "approve", args: [ARC.gatewayWallet, balance], gas: APPROVE_GAS,
  });
  const approveReceipt = await pub.waitForTransactionReceipt({ hash: approveTx });
  if (approveReceipt.status !== "success") throw new Error("deposit transaction failed (approve)");

  const depositTx = await wallet.writeContract({
    address: ARC.gatewayWallet, abi: GATEWAY_WALLET_DEPOSIT_ABI, functionName: "deposit", args: [ARC.usdc, balance], gas: DEPOSIT_GAS,
  });
  const depositReceipt = await pub.waitForTransactionReceipt({ hash: depositTx });
  if (depositReceipt.status !== "success") throw new Error("deposit transaction failed");

  return Number(balance); // USDC atomic units (6 dec) == µUSD
}
