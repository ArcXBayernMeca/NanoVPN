# 05 — Glossary

- **Nanopayment** — a payment of extremely small value (down to **$0.000001**) made
  economical by **batching** many off-chain authorizations into a single on-chain
  settlement. The whole point of this hackathon.
- **Lepton** — historically 1/100 of a Greek drachma, the smallest coin; namesake of the
  hackathon (smallest-scale payments).
- **Arc** — Circle's EVM-compatible L1 where **USDC is the native gas token**;
  sub-second finality, predictable USDC fees. Testnet chain ID `5042002`.
- **USDC** — Circle's USD stablecoin. On Arc: ERC-20 at
  `0x3600000000000000000000000000000000000000`, **6 decimals**. Also the native gas token
  (18 decimals as native) — don't mix the two decimal conventions.
- **EURC** — Circle's euro stablecoin (Arc: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`).
- **x402** — open protocol reviving HTTP **`402 Payment Required`**: server replies `402`
  + price, client pays USDC and retries with an `X-PAYMENT` header. Per-request, no
  accounts/API keys; designed for AI agents to pay autonomously.
- **Circle Gateway** — gives a **unified USDC balance** across chains + instant (<500ms)
  transfers; also the settlement layer for **batched nanopayments**.
- **Gateway Wallet / Gateway Minter** — Circle contracts behind Gateway. Testnet (all
  chains): Wallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, Minter
  `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`.
- **`TransferWithAuthorization`** — the EIP-712 typed-data message a buyer signs off-chain
  (no gas) to authorize a USDC debit; the unit that gets batched.
- **`submitBatch`** — the on-chain call (on the Gateway Wallet contract) that settles a
  batch of authorizations; `calldataBytes` encodes `(address, int256 delta)` pairs.
- **Facilitator** — Circle service that verifies/relays x402 payments
  (`POST /v1/x402/settle`), returns a settlement UUID, and debits optimistically.
- **Batching / relayer** — Circle's relayer accumulates signed authorizations and submits
  them together via `submitBatch`, eliminating per-payment gas.
- **CCTP** — Circle's Cross-Chain Transfer Protocol (burn-and-mint USDC bridging). Arc's
  CCTP/Gateway domain is `26`.
- **Egress node** — in this project, a proxy server that forwards a buyer's traffic, meters
  bytes, and gates the session on USDC payment.
- **Buyer-brain** — our AI agent that selects a node, manages a USDC budget, and
  pauses/switches; runs as a human co-pilot or an autonomous agent client.
- **RFB** — "Request for Builders": the hackathon's six suggested project themes.
- **arc-canteen** — the hackathon's ARC CLI (auth'd Arc RPC, docs/samples, submissions).
- **`circle`** — the Circle CLI (`@circle-fin/cli`): wallets, Gateway, x402 `services pay`.
