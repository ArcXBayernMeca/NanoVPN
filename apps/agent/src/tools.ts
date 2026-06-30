import { NODE_REGION } from "@nanovpn/core";

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
    description: "Pay USDC (x402) for ONE geo-located egress request through a SPECIFIC node you choose. Returns upstream HTTP status, bytes, and the node's egress IP (geo proof). Each call is one payment.",
    input_schema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "The id of the node to route through (from listNodes)." },
        url: { type: "string", description: "The absolute https URL to fetch through the egress node." },
      },
      required: ["nodeId", "url"], additionalProperties: false,
    },
  },
] as const;

export interface Executors {
  listNodes(): Promise<{ id: string; city: string; country: string; pricePerRequestUsd: number }[]>;
  getBalance(): Promise<{ wallet: string; gatewayAvailable: string }>;
  payRequest(input: { nodeId: string; url: string }): Promise<{ status: number; bytes: number; egressIp: string; amountMicroUsd: number; transaction: string; nodeId: string }>;
}

interface Buyer {
  pay<T>(url: string, opts?: { method?: string; headers?: Record<string, string> }): Promise<{ data: T; amount: bigint; transaction: string; status: number }>;
  getBalances(): Promise<{ wallet: { formatted: string }; gateway: { formattedAvailable: string } }>;
}

export function makeExecutors(deps: {
  nodesReader: () => Promise<{ id: string; city: string; country: string; proxy_url: string; price_per_request_usd: number }[]>;
  buyer: Buyer;
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
    async payRequest({ nodeId, url }) {
      const node = (await deps.nodesReader()).find((n) => n.id === nodeId);
      if (!node) throw new Error(`unknown node ${nodeId}`);
      // Pin egress to the node's real Fly region (Prefer-Region routes; node fly-replay enforces).
      const region = NODE_REGION[node.id];
      const headers: Record<string, string> = region
        ? { "fly-prefer-region": region, "x-nanovpn-region": region }
        : {};
      const res = await deps.buyer.pay<{ status: number; bytes: number; egressIp: string }>(
        `${node.proxy_url}/egress?url=${encodeURIComponent(url)}`, { method: "POST", headers },
      );
      return { status: res.data.status, bytes: res.data.bytes, egressIp: res.data.egressIp, amountMicroUsd: Number(res.amount), transaction: res.transaction, nodeId };
    },
  };
}
