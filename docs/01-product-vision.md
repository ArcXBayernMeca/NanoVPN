# 01 — Product Vision

## One-liner

**NanoVPN** is a pay-per-use VPN where you pay **per megabyte in USDC** instead of a
monthly subscription — settled as **nanopayments on Arc**. It serves **humans** (a
world-map app with a live payment counter) and **AI agents** (metered egress via x402)
over the same core, with an **AI buyer-brain** that picks the best node and manages the
budget.

> Working title is **NanoVPN**. Final branding is TBD (candidates: NanoVPN, FlowVPN,
> Tollgate, MeterVPN). Decide during the UI/branding pass.

## The problem

Most people pay $5–12/month for a VPN they use a handful of times — airport Wi-Fi, one
geo-locked stream, an occasional privacy need. The subscription model overcharges light
users and underserves "I just need it for 20 minutes" moments. Meanwhile, **AI agents**
increasingly need geo-located/residential egress (to browse, scrape, reach geo-restricted
APIs) and have **no clean pay-as-you-go way** to buy it — they'd need accounts, API keys,
and card billing that don't fit machine-speed, per-request economics.

Both problems are the same gap: **there's no good way to pay for bandwidth by the byte.**
Nanopayments on Arc make per-byte/per-request pricing economically viable for the first
time (sub-cent units, gas-free batching, <500ms settlement).

## Who it's for

1. **Light/occasional VPN users** — pay only for what they use; no subscription.
2. **AI agents & agent developers** — programmatic, per-request egress via x402; budget
   managed autonomously.
3. **(Stretch) Bandwidth providers** — anyone with a server can register a node, set a
   price, and earn USDC per byte served (the A2A marketplace).

## What makes it a strong hackathon entry

| Rubric axis | How NanoVPN scores |
|-------------|--------------------|
| **Agentic (30%)** | The **buyer-brain** decides which node to use, when to switch, when to pause, and enforces a budget — for both humans (co-pilot) and agents (autonomous client). The agent door is literally RFB 1. |
| **Traction (30%)** | Real, working proxy + real on-chain USDC. Agent devs are a reachable user base; a "connect and watch real USDC stream" demo converts. |
| **Tool usage (20%)** | Uses **Circle Wallets + Gateway (nanopayment batching) + x402 + USDC on Arc** together — the full stack, not one piece. |
| **Innovation (20%)** | Per-byte streaming money for bandwidth + a two-sided human/agent market is a genuinely novel framing of "metered internet." |

## The demo (what the <3-min video shows)

1. Open the app → world map with live nodes.
2. Deposit a little USDC (or show pre-funded balance).
3. Let the **AI co-pilot** auto-pick a node ("cheapest node under 80ms to a JP endpoint"),
   or pick one manually on the map.
4. Connect → traffic flows → **the counter ticks up in real time** (MB used, USD spent),
   with on-chain settlements appearing and linking to arcscan.
5. Flip to the **agent view**: an AI agent hits the x402 egress endpoint, pays per
   request autonomously, and completes a task it couldn't do without geo egress.
6. (Stretch) Show the **marketplace**: multiple priced nodes, the buyer-brain choosing
   among them.

## Explicit non-goals (YAGNI)

- Not a production-grade, audited, anonymity-hardened VPN. It's a demo of **metered,
  pay-per-byte egress with real on-chain settlement.**
- Not a full WireGuard L3 tunnel across many regions (see
  [ADR-0002](04-decisions/ADR-0002-egress-realism.md)).
- Not trustless streaming via payment channels (see
  [ADR-0003](04-decisions/ADR-0003-settlement-model.md)).
- No mainnet. Testnet only.
