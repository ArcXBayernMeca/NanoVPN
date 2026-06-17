export type SessionStatus = "active" | "paused" | "stopped";

export interface NodeListing {
  id: string;
  operatorAddress: string;   // seller wallet (receives USDC)
  geo: { country: string; city: string; lat: number; lng: number };
  proxyUrl: string;          // host:port the client points HTTPS_PROXY at
  settleUrl: string;         // x402 endpoint the buyer pays, e.g. http://host:8080/settle
  pricePerGbUsd: number;
  pricePerRequestUsd: number;
}

export interface Session {
  id: string;
  userAddress: string;       // SIWE identity (EOA)
  nodeId: string;
  sessionToken: string;      // presented by the proxy client
  status: SessionStatus;
  budgetMicroUsd: number;
  spentMicroUsd: number;     // metered (instant)
  settledMicroUsd: number;   // confirmed on-chain (batched)
  createdAt: string;
}

export interface UsageTick {
  sessionId: string;
  totalBytes: number;
  spentMicroUsd: number;
  unsettledMicroUsd: number;
  ts: number;
}

export interface Settlement {
  id: string;                // local uuid
  sessionId: string;
  settlementUuid: string;    // facilitator `transaction`
  amountMicroUsd: number;
  payer: string;
  payee: string;
  network: string;           // "eip155:5042002"
  status: string;            // received | batched | completed | confirmed | failed
  txHash: string | null;     // best-effort on-chain submitBatch hash (stretch)
  createdAt: string;
}
