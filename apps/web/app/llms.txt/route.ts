const TXT = `# NanoVPN
Pay-per-use geo egress, settled in USDC on Arc testnet via x402.

Agent onboarding: /agent-onboarding
Per-request egress endpoint: POST /egress?url=<absolute-https-url> (x402, Circle Gateway batched scheme)
Live agent activity: /agent
`;

export async function GET() {
  return new Response(TXT, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
