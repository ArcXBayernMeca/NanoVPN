import { createPublicClient, http, type PublicClient } from "viem";
import { arcTestnet } from "viem/chains";

export const ARC = {
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  network: "eip155:5042002",
  rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
  usdc: "0x3600000000000000000000000000000000000000" as const,
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const,
  domain: 26,
  explorer: "https://testnet.arcscan.app",
  facilitator: "https://gateway-api-testnet.circle.com",
  usdcDecimals: 6,
  eip712: { name: "GatewayWalletBatched", version: "1" },
} as const;

export function arcPublicClient(): PublicClient {
  return createPublicClient({ chain: arcTestnet, transport: http(ARC.rpcUrl) });
}

export const explorerTx = (hash: string) => `${ARC.explorer}/tx/${hash}`;
export const explorerAddr = (a: string) => `${ARC.explorer}/address/${a}`;
