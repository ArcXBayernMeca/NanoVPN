# 03 — Stack & Tooling

> Verified facts about Arc, Circle, x402, and the organizer CLIs. Last verified
> 2026-06-16 against the `circle:use-arc` / `circle:use-gateway` skills and the
> organizer reference repos. **Always re-check the live docs before coding:**
> Arc → https://docs.arc.network/llms.txt · Circle → https://developers.circle.com/llms.txt

## Arc Testnet — network config

| Field | Value |
|-------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` (hex `0x4CEF52`) |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |
| CCTP / Gateway domain | `26` |

- **USDC is the native gas token.** No ETH needed.
- **Dual decimals:** native gas = **18 decimals**; ERC-20 USDC = **6 decimals**. Never mix.
- **EVM-compatible:** Foundry, Hardhat, viem, wagmi all work. **viem ships `arcTestnet`
  built-in** — no custom chain def needed.
- Testnet only. Never target mainnet.

### Token addresses (Arc)

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3600000000000000000000000000000000000000` | 6 |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |

### Circle Gateway contracts (EVM **testnet**, same address all chains)

| Contract | Address |
|----------|---------|
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

(Mainnet addresses differ — see `circle:use-gateway`. We don't use mainnet.)

## Circle Gateway & nanopayments

- **Gateway** gives a **unified USDC balance** across chains and **instant (<500ms)**
  transfers (deposit → burn intent (EIP-712) → Gateway API attestation → `gatewayMint`).
- **Nanopayments** = gas-free USDC as small as **$0.000001** via **batched** settlements.
  Many off-chain signed authorizations are collected and submitted as **one** on-chain
  `submitBatch` — that's what makes sub-cent payments viable.
- For our **streaming** balance + **x402** batching we use the batching SDK (below),
  not raw Gateway bridge calls.

## x402 settlement flow (verified from `the-canteen-dev/circle-agent`)

1. Buyer signs an **EIP-712 `TransferWithAuthorization`** off-chain (**no gas**).
2. Server forwards the authorization to the **Circle facilitator**: `POST /v1/x402/settle`.
3. Facilitator returns a **settlement UUID**; balance is debited optimistically.
4. Circle's **relayer batches** multiple payments together.
5. Relayer calls **`submitBatch(calldataBytes, signature)`** on the **Gateway Wallet**
   contract.
6. Settlement status → `completed` after the batch tx mines (visible on arcscan).

The HTTP side: client GET → `402 Payment Required` + payment challenge → client retries
with an `X-PAYMENT` header → server verifies via facilitator → returns the resource.

> **Security:** never modify Circle's EIP-712 type definitions / domain separators /
> struct hashes — use them exactly as the SDK/reference provides, or signatures are
> invalid.

## SDK packages (from the reference repos)

| Package | Purpose |
|---------|---------|
| `@circle-fin/x402-batching` | `GatewayClient` — batches x402 authorizations into on-chain settlements (the core of our Settlement Service) |
| `viem` / `wagmi` (`wagmi@^3` in Circle examples) | Chain access; `arcTestnet` is built-in |
| Circle Wallets SDK | wallet creation/management (see wallet skills) |
| `langchain` + `deepagents` | the reference paying-agent framework (model choice is open for us; Claude is an option) |

> There is **no SDK** for raw Gateway unified-balance ops — those are direct contract +
> REST API calls. The batching SDK above is what we actually need.

## The two organizer CLIs (installed on this machine)

### Circle CLI — `circle` (npm `@circle-fin/cli`, v0.0.5)
Installed globally. Unified interface for wallets, Gateway, x402, bridging.

| Group | Key commands | Use for |
|-------|-------------|---------|
| `wallet` | `login` (email OTP), `create` (agent wallet), `import`, `balance`, `fund` (faucet on testnet), `transfer`, `list`, `status` | Wallets for users/agents/nodes |
| `gateway` | `balance`, `deposit`, `withdraw` | Fund / read the nanopayment USDC balance |
| `services` | `search`, `inspect`, `pay` | **Discover x402 services & auto-pay** — directly useful for the agent buyer flow |
| `bridge` | `transfer`, `status`, `get-fee` | CCTP cross-chain USDC |
| `contract` | `address`, `query` | Look up Circle contract addresses / read-only calls |
| `blockchain` | `list`, `config` | Inspect/override RPC config |
| `skill` | `list`, `info`, `install`, `update` | Install Circle skills into tools |
| `terms` | `accept` | One-time terms acceptance (needed before use) |

### ARC CLI — `arc-canteen` (uv tool, v0.1.12, at `~/.local/bin`)
Project tracking + **authenticated Arc testnet RPC** + docs/samples + **hackathon
submissions**. Local state in `~/.arc-canteen/`.

| Command | Use for |
|---------|---------|
| `login` | GitHub auth + profile setup (**interactive — a human must run this**) |
| `rpc-url [--export]` | Print authenticated JSON-RPC URL (token embedded) |
| `rpc <method> [params]` | Authenticated JSON-RPC call to Arc |
| `rotate-rpc-key` | Mint a fresh 90-day RPC token |
| `shell-init` | rc snippet that auto-loads `$RPC` in new shells |
| `context sync` | Clone/pull `context-arc` (docs + 5 sample codebases) into `~/.arc-canteen/context/` |
| `context [--paths\|--full]` | Print the doc/sample manifest (or inline all docs) for agent context |
| `status` | Dashboard |
| `update-traction` / `update-product` | **Submit hackathon progress** (judging traction) |
| `submit-puzzle` | Easter-egg puzzles |
| `push` | Flush queued local events to the server |

> The authenticated `rpc-url` is an alternative to the public RPC and may be required for
> reliable testnet access during the event. Run `arc-canteen shell-init` output into your
> shell rc to get `$RPC` automatically.

## First-time setup

These need **interactive** auth, so a human runs them (an agent can't):

```bash
# 0. Make sure ~/.local/bin is on PATH (uv installs arc-canteen there)
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc / ~/.zshrc

# 1. Authenticate the ARC CLI (GitHub) + pull docs & sample codebases
arc-canteen login
arc-canteen context sync          # → ~/.arc-canteen/context/ (great for AI context)
eval "$(arc-canteen shell-init)"  # exposes $RPC

# 2. Accept Circle CLI terms + log in + create/fund a wallet
circle terms accept
circle wallet login               # email OTP
circle wallet create --blockchain arc-testnet   # (verify exact flag via `circle wallet create --help`)
circle wallet fund                # testnet faucet
circle gateway deposit            # move USDC into the Gateway balance

# 3. Get testnet USDC
#    https://faucet.circle.com
```

> Exact flags vary by CLI version — confirm with `--help` on each subcommand. Record any
> deviations back into this file.

## Reference repositories

Clone these to copy proven patterns (do **not** reinvent the x402/Gateway plumbing):

| Repo | Stack | What to copy |
|------|-------|--------------|
| `circlefin/arc-nanopayments` | Next.js seller + LangChain/deepagents buyer + Supabase + `@circle-fin/x402-batching` + tailwind/shadcn | End-to-end nanopayment loop; paying-agent decision logic; dashboard with live payment updates; `generate-wallets`, `proxy.ts` |
| `the-canteen-dev/circle-agent` | TypeScript (`server.ts`, `buyer.ts`, `decode-batch.ts`) + plain HTML | Minimal x402 server + buyer; **on-chain batch decoder** (great for the live "settled on-chain" view) |
| `circlefin/arc-commerce`, `arc-escrow`, `arc-p2p-payments`, etc. | various | Other Arc patterns if needed |

Key env vars seen across references (ours will be similar — keep them in `.env`, never
commit): `ARC_TESTNET_RPC`/`ARC_TESTNET_RPC_URL`, `PRIVATE_KEY`,
`SELLER_ADDRESS`/`SELLER_PRIVATE_KEY`, `BUYER_ADDRESS`/`BUYER_PRIVATE_KEY`, optional
`OPENAI_API_KEY` (reference agent; we may use `ANTHROPIC_API_KEY` instead). See
[.env.example](../.env.example).

## Proposed app stack (open — confirm during design)

- **Frontend/app:** Next.js (App Router) + Tailwind + shadcn/ui + map lib
  (react-simple-maps / MapLibre / globe.gl — TBD) → deploy on Vercel.
- **Chain:** viem/wagmi (`arcTestnet`) + `@circle-fin/x402-batching` + Circle Wallets.
- **Egress nodes:** lightweight proxy (Go or Node) with a byte-metering middleware on
  small VMs in 2–3 regions.
- **Data:** Postgres (Neon via Vercel Marketplace) or Supabase (matches the reference) for
  sessions, usage, settlements, and the node registry.
- **AI buyer-brain:** Claude via the Anthropic API _(reference uses LangChain+OpenAI;
  model choice open)_.
