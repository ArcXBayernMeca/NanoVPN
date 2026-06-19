export const TOOL_DEFS = [
  {
    name: "listNodes",
    description: "List available egress nodes (id, city, country, per-request price in USD). Call this first to choose where to route egress.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getBalance",
    description: "Get the agent wallet's USDC balance (wallet + Gateway available). Use to check funds before paying.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "payRequest",
    description: "Pay USDC (x402) for ONE geo-located egress request through the selected node. Returns the upstream HTTP status, bytes transferred, and the node's egress IP (geo proof). Each call is one payment.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "The absolute https URL to fetch through the egress node." } },
      required: ["url"], additionalProperties: false,
    },
  },
] as const;

export interface Executors {
  listNodes(): Promise<{ id: string; city: string; country: string; pricePerRequestUsd: number }[]>;
  getBalance(): Promise<{ wallet: string; gatewayAvailable: string }>;
  payRequest(input: { url: string }): Promise<{ status: number; bytes: number; egressIp: string; amountMicroUsd: number; transaction: string }>;
}

interface Buyer {
  pay<T>(url: string, opts?: { method?: string }): Promise<{ data: T; amount: bigint; transaction: string; status: number }>;
  getBalances(): Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }>;
}

export function makeExecutors(deps: {
  nodesReader: () => Promise<{ id: string; city: string; country: string; price_per_request_usd: number }[]>;
  buyer: Buyer;
  egressBaseUrl: string;
}): Executors {
  return {
    async listNodes() {
      const rows = await deps.nodesReader();
      return rows.map((n) => ({ id: n.id, city: n.city, country: n.country, pricePerRequestUsd: n.price_per_request_usd }));
    },
    async getBalance() {
      const b = await deps.buyer.getBalances();
      return { wallet: b.wallet.formatted, gatewayAvailable: b.gateway.formattedAvailable };
    },
    async payRequest({ url }) {
      const res = await deps.buyer.pay<{ status: number; bytes: number; egressIp: string }>(
        `${deps.egressBaseUrl}?url=${encodeURIComponent(url)}`, { method: "POST" },
      );
      return { status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp, amountMicroUsd: Number(res.amount), transaction: res.transaction };
    },
  };
}
