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

> ✅ **Live-verified 2026-06-21** as `nanovpn-edge.fly.dev` (Tokyo `nrt`). The steps below
> are the ones that actually worked — they correct several assumptions in the original draft.

**`fly.toml` lives at the repo root** (not in `apps/edge-node/`). It must, because the
Dockerfile's build context is the monorepo root (it `COPY`s `packages/` + `apps/edge-node`),
and Fly resolves the `[build] dockerfile` path relative to the config-file directory — so a
config inside `apps/edge-node/` produces a doubled `apps/edge-node/apps/edge-node/Dockerfile`
path and fails. Keep `fly.toml` at root and deploy from root.

1. **Create the app** (one-time). `fly apps create` does **not** auto-allocate IPs the way
   `fly launch` does — we allocate them in step 4.

   ```bash
   fly apps create nanovpn-edge
   ```

2. **Set secrets** (stage them; applied on first deploy):

   ```bash
   fly secrets set --stage --app nanovpn-edge \
     BUYER_PRIVATE_KEY=<hex> \
     SELLER_ADDRESS=<0x…> \
     NEXT_PUBLIC_SUPABASE_URL=<url> \
     SUPABASE_SERVICE_ROLE_KEY=<key> \
     EDGE_NODE_PUBLIC_URL=https://nanovpn-edge.fly.dev
   ```

3. **Deploy from the repo root** with the remote builder (no local Docker needed):

   ```bash
   fly deploy --remote-only
   ```

   **Memory:** the node runs via `tsx` (runtime TS compile of viem + the Circle SDK), which
   needs **≥ 1 GB RAM** — the 256 MB default OOM-kills it (Exit 137) into a crash loop. Bump it:

   ```bash
   fly scale memory 1024 --app nanovpn-edge
   ```

   (Cold boot on `shared-cpu-1x` is ~2 min because `tsx` compiles at startup. `auto_stop_machines`
   is off so it stays warm. For a cheaper/faster node, precompile to JS — `esbuild --bundle` →
   `node dist/index.js` — and you can then scale to 256 MB + enable auto-stop. TODO, not done.)

4. **Allocate a public IP — a *dedicated* IPv4 is required.** A raw-TCP `[[services]]` (which
   we need so CONNECT tunnels pass through unmangled) is **not routable on Fly's free shared
   IPv4**; that only works for `[http_service]`. Shared v4 publishes no A-record and the
   CONNECT/agent paths are unreachable. Dedicated IPv4 is **$2/mo**.

   ```bash
   fly ips allocate-v4 --app nanovpn-edge        # dedicated, $2/mo
   fly ips allocate-v6 --app nanovpn-edge        # free
   ```

5. **Verify** (give DNS/edge ~1–2 min after allocating the IP):

   ```bash
   curl https://nanovpn-edge.fly.dev/health      # → ok
   ```

6. **Repoint the Supabase node rows** — set every node's:

   | column | value |
   |--------|-------|
   | `proxy_url` | `https://nanovpn-edge.fly.dev` ← used as both `${proxy_url}/egress` (agent x402) **and** the undici `ProxyAgent` URI for human CONNECT. Must be a full `https://` URL, **not** `host:443`. |
   | `settle_url` | `https://nanovpn-edge.fly.dev/settle` |

   For the MVP all node listings point at this one host (egress IP is identical until
   multi-region). Also set the web app's `NEXT_PUBLIC_EDGE_NODE_URL=https://nanovpn-edge.fly.dev`.

7. Region codes: Tokyo `nrt`, Frankfurt `fra`, NYC `ewr`.
   Add later (Layer 3 multi-node): `fly regions add fra ewr`.

> 💸 **Cost / teardown:** dedicated IPv4 ($2/mo) + 1 GB `shared-cpu-1x` (~$5/mo) ≈ **$7/mo if
> left running 24/7**. For a hackathon, `fly apps destroy nanovpn-edge` after the demo stops
> all charges (and releases the IP).

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
