# Deploy

## Port model

The edge-node serves HTTP (health, register, SSE, settle) **and** the HTTP CONNECT
proxy on a single container port **8080** (one `http.createServer` with both a request
handler and `server.on("connect", ...)`). Fly exposes this as a raw-TCP service with
TLS termination at **443**, forwarding plaintext to port 8080 inside the container.

- The web app reaches HTTP/SSE over `https://nanovpn-edge.fly.dev`
- Clients use `nanovpn-edge.fly.dev:443` as the proxy host for CONNECT tunnels

Using a raw `[[services]]` block (not `[http_service]`) is required so Fly does not
HTTP-parse and mangle CONNECT requests.

⚠️ Verify the exact `[[services]]` schema with `fly launch` / `fly config validate`
at deploy time — this config was authored without a live Fly deploy.

---

## Edge node (Fly.io)

1. From the repo root, run:

   ```bash
   fly launch --no-deploy
   ```

   Fly will detect `apps/edge-node/fly.toml` (or pass `--config apps/edge-node/fly.toml`).

2. Set secrets:

   ```bash
   fly secrets set \
     BUYER_PRIVATE_KEY=<hex> \
     SELLER_ADDRESS=<0x…> \
     NEXT_PUBLIC_SUPABASE_URL=<url> \
     SUPABASE_SERVICE_ROLE_KEY=<key> \
     EDGE_NODE_PUBLIC_URL=https://nanovpn-edge.fly.dev
   ```

3. Deploy:

   ```bash
   fly deploy
   ```

4. Verify the health endpoint:

   ```bash
   curl https://nanovpn-edge.fly.dev/health
   # → ok
   ```

5. After deploy, insert (or update) the node row in Supabase:

   | column | value |
   |--------|-------|
   | `proxy_url` | `nanovpn-edge.fly.dev:443` ← TLS port the CONNECT proxy is reachable on; clients use this as an HTTPS proxy |
   | `settle_url` | `https://nanovpn-edge.fly.dev/settle` |

6. Region codes: Tokyo `nrt`, Frankfurt `fra`, NYC `ewr`.
   Add later (Layer 3 multi-node): `fly regions add fra ewr`

---

## Web (Vercel)

1. Import the repo into Vercel.
   - Root directory: `apps/web`
   - Framework: Next.js

2. Set environment variables:

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
   | `NEXT_PUBLIC_EDGE_NODE_URL` | `https://nanovpn-edge.fly.dev` |

3. Deploy; open the preview URL and run the demo runbook (`docs/demo-runbook.md`).
