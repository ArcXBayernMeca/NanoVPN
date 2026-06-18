# NanoVPN Layer 1 demo runbook

## One-time setup
1. `pnpm install`
2. `pnpm wallets` → paste BUYER/SELLER keys into `.env`.
3. Fund BUYER at https://faucet.circle.com; `circle gateway deposit --testnet` to move buyer USDC into the Gateway balance. Fund SELLER with a little native gas.
4. Apply Supabase migration (`supabase db push`); set Supabase env vars; update the `nodes` row `operator_address`/`proxy_url`/`settle_url` to the deployed node + SELLER_ADDRESS.

## Run locally
- Terminal A: `pnpm --filter @nanovpn/edge-node start`
- Terminal B: `pnpm --filter web dev`
- Open http://localhost:3000

## Demo script (<3 min)
1. Connect wallet (MetaMask on Arc testnet) → Sign in (SIWE).
2. Click Tokyo on the map → Connect.
3. Click "Browse" a few times (drives real traffic through the node) → watch the **counter tick** in µUSD/MB.
4. Watch **on-chain settlements** appear in the right rail every ~$0.01/10s, each linking to arcscan / the facilitator transfer.

## Real VPN usage (optional, outside the browser)
`export HTTPS_PROXY="http://<sessionToken>:@<proxyHost>:8080"` then `curl https://ipinfo.io` — your egress IP is the node's region; the counter still ticks.

## Step 4: Manual live settlement check

**Procedure** (requires funded buyer wallet + deployed node):
1. Complete One-time setup above with real keys and a funded buyer Gateway balance.
2. Run the demo script (connect → Browse several times).
3. Query Supabase: confirm a row in `settlements` has a non-null `settlement_uuid`.
4. Verify on-chain: `GET https://gateway-api-testnet.circle.com/v1/x402/transfers/<settlement_uuid>` — wait for `status` to reach `completed`.

> Live settlement status: PENDING — run after funding the buyer wallet (see One-time setup).
