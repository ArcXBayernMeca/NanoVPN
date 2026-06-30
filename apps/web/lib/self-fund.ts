// apps/web/lib/self-fund.ts
import "server-only";
import { createWalletClient, http, parseEther, formatUnits, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";
const MIN_NATIVE = parseEther("0.02"); // sponsor gas if the EOA has less than this

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/** Deposit the EOA's current USDC balance into Gateway (sponsoring small gas if needed). Returns µUSD deposited (0 if none). */
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

  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: eoaPrivateKey });
  await gateway.deposit(formatUnits(balance, ARC.usdcDecimals));
  return Number(balance);
}
