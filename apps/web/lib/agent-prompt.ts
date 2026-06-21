export const EGRESS_ENDPOINT_FACTS = {
  url: "https://<node-host>/egress?url=<absolute-https-url>",
  network: "eip155:5042002",
  scheme: "exact",
  pricePerRequestUsd: 0.001,
} as const;

/** Drop this into your own AI agent's system prompt to let it buy NanoVPN egress. */
export const AGENT_PROMPT = `You can buy geo-located internet egress per request from NanoVPN, paid in USDC on Arc testnet (chain 5042002) using the x402 payment protocol.

To fetch a URL through a NanoVPN node:
1. POST /egress?url=<absolute-https-url> to the node. With no payment you get HTTP 402 and a PAYMENT-REQUIRED challenge (Circle Gateway "exact" scheme on network eip155:5042002).
2. Sign the payment authorization with your funded wallet and retry with the Payment-Signature header. The @circle-fin/x402-batching GatewayClient.pay(url, { method: "POST" }) does this whole 402→sign→retry flow for you.
3. The node verifies payment, fetches the URL through its egress IP, settles the payment, and returns { status, bytes, egressIp }. A failed connection is NOT charged.

Each request costs a flat ~$0.001 USDC. Fund your wallet with Arc testnet USDC first. Stay within your budget; stop when your task is done.`;
