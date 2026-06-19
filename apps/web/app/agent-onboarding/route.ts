const DOC = `# NanoVPN — Agent Onboarding

NanoVPN sells geo-located egress per request, paid in USDC on Arc testnet (chain 5042002) via x402.

## 1. Get a wallet
Use a Circle Agent Wallet (or any EOA). For the demo, a pre-funded wallet is used.

## 2. Fund it (reference — not required for the hosted demo)
Arc testnet USDC via Circle's programmatic faucet:
  circle wallet fund --chain ARC-TESTNET
or POST /v1/faucet/drips. (The hosted demo runs on a pre-funded wallet; live self-funding is documented, not load-bearing.)

## 3. Pay per request (x402)
  POST /egress?url=<absolute-https-url>
- No payment header → 402 with a PAYMENT-REQUIRED challenge (Circle Gateway batched scheme).
- Sign the authorization and retry with the Payment-Signature header.
- The node verifies, fetches the URL through its egress IP, settles the payment, and returns:
    { "status": <upstream http status>, "bytes": <n>, "egressIp": "<node outbound ip>" }
- A failed connection is NOT charged (settlement is withheld until egress is delivered).

The @circle-fin/x402-batching GatewayClient.pay(url, { method: "POST" }) handles the full flow.
`;

export async function GET() {
  return new Response(DOC, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
