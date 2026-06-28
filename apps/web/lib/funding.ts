// apps/web/lib/funding.ts
import "server-only";
import { createWalletClient, http, parseUnits, parseEther, erc20Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { ARC, arcPublicClient } from "@nanovpn/core";

const GRANT_USD = process.env.USER_GRANT_USD ?? "0.50";       // ERC-20 USDC grant (6 dec)
const GAS_NATIVE = process.env.USER_GAS_NATIVE ?? "0.05";     // native USDC-gas (18 dec) for approve+deposit; tune via arcscan

function sponsorKey(): Hex {
  const k = process.env.SPONSOR_PRIVATE_KEY ?? process.env.BUYER_PRIVATE_KEY;
  if (!k) throw new Error("SPONSOR_PRIVATE_KEY (or BUYER_PRIVATE_KEY) not configured");
  return k as Hex;
}

/**
 * Fund a freshly-minted spending EOA from the sponsor wallet, then have the EOA
 * deposit its grant into Circle Gateway (so x402 settlement can draw from it).
 * Returns the granted amount in µUSD. Caller must only invoke for unfunded wallets.
 */
export async function fundSponsored(eoaPrivateKey: Hex): Promise<number> {
  const eoa = privateKeyToAccount(eoaPrivateKey);
  const pub = arcPublicClient();
  const sponsor = createWalletClient({
    account: privateKeyToAccount(sponsorKey()),
    chain: arcTestnet,
    transport: http(ARC.rpcUrl),
  });

  // 1. native USDC-gas (18 dec) so the EOA can pay for its own approve + deposit
  const gasTx = await sponsor.sendTransaction({ to: eoa.address, value: parseEther(GAS_NATIVE) });
  await pub.waitForTransactionReceipt({ hash: gasTx });

  // 2. ERC-20 USDC grant (6 dec)
  const grantTx = await sponsor.writeContract({
    address: ARC.usdc,
    abi: erc20Abi,
    functionName: "transfer",
    args: [eoa.address, parseUnits(GRANT_USD, ARC.usdcDecimals)],
  });
  await pub.waitForTransactionReceipt({ hash: grantTx });

  // 3. the EOA deposits its grant into Gateway (deposit() does approve + deposit internally)
  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: eoaPrivateKey });
  await gateway.deposit(GRANT_USD);

  return Math.round(Number(GRANT_USD) * 1_000_000);
}
