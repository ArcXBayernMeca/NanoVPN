# 00 — Hackathon Brief: Lepton Agents Hackathon

> Source of truth for the event we're building for. Last verified 2026-06-16 from the
> event site (https://lepton.thecanteenapp.com) and Arc/Circle announcements.

## The event

- **Name:** Lepton Agents Hackathon
- **Host:** Canteen (crypto × AI × payments research/tech firm)
- **Partners:** Circle (NYSE: CRCL) + Arc Network
- **Format:** Online, 2 weeks, invite-only
- **Dates:** **June 15 – June 29, 2026** (submissions close June 29)
- **Prize pool:** **$50,000**
- **Why "Lepton":** the lepton was 1/100 of a drachma — the smallest coin. The event is
  about **nanopayments**: value as small as **$0.000001**, clearing in **<500ms**,
  settled on **Arc** in **USDC**, gas-free via **batched** transactions.

## Prizes

- Grand prizes ($40k): 1st $10k · 2nd $7.5k ×2 · 3rd $5k ×3
- Standout teams ($7.5k): 10–12 teams, ~$650–750 each
- Feedback incentives ($500): best product feedback on Circle tooling
- Easter eggs ($2k): code golf, Discord puzzles, side quests

## Requests for Builders (RFBs)

1. **Autonomous Paying Agents** — agents discover, evaluate, pay for paywalled
   APIs/data/compute while managing budgets.
2. **Selling Agent Services via Nanopayments** — pay-per-call, no subscription overhead.
3. **Agent-to-Agent Nanopayment Networks** — agents paying agents for specialized work.
4. **Streaming & Continuous Payments** — pay-per-second for compute/data/live media;
   start/pause/stop a stream of value.
5. **Nanopayment Infrastructure & Tooling** — SDKs, wallet-fleet mgmt, dashboards.
6. **Creator & Publisher Monetization** — monetize a single article/photo/song without a
   monthly commitment.

**Open Track:** build anything real running on Arc.

> **Where NanoVPN sits:** primarily **RFB 4 (streaming/continuous payments)** and
> **RFB 1 (autonomous paying agents)** for the agent door, with **RFB 3 (A2A)** as the
> stretch marketplace and **RFB 5 (tooling)** if we ship a reusable metered-egress SDK.

## Judging rubric (internalize this)

| Weight | Criterion | What it rewards |
|--------|-----------|-----------------|
| **30%** | **Agentic Sophistication** | How much the AI actually *decides* vs. just automates |
| **30%** | **Traction** | Real users, real payments, real volume in 2 weeks |
| 20% | Circle Tool Usage | Creative use of Wallets, Gateway, App Kit, x402, USDC |
| 20% | Innovation | Novel approaches, emergent behavior, research insight |

**Implication for us:** a pure consumer VPN (human picks server, pays) scores ~0 on the
30% agentic axis. The **buyer-brain AI** and the **agent x402 door** exist specifically
to cover that axis. Real, working, on-chain payments cover Traction. Using
Wallets+Gateway+x402 together covers Tool Usage.

## Submission requirements

- **Public GitHub repo** (required)
- **Recorded video demo, < 3 minutes** (Loom/YouTube/Vimeo) (required)
- **Live deployed product link** (strongly encouraged)
- Asynchronous review; **multiple submissions allowed**; **no live demo day**
- Traction questions asked: how many users onboarded, what problem you're solving

Submit progress during the event via the **ARC CLI** (`arc-canteen update-traction` /
`arc-canteen update-product`) — see [03-stack-and-tooling.md](03-stack-and-tooling.md).

## Official tech stack (organizer-provided)

- **Arc** — Circle's L1; native USDC gas, sub-second finality.
- **Gateway / Nanopayments** — gas-free USDC down to $0.000001 via batched txns.
- **x402** — HTTP 402 "Payment Required" flow for pay-per-request APIs/content.
- **Arc CLI** (`arc-canteen`) — authenticated testnet RPC + docs/samples + submissions.
- **Circle CLI** (`@circle-fin/cli`) — agent wallets, x402 payments, crosschain.
- **App Kits** — Send, Bridge, Swap, Unified Balance, Combine.
- **Agent Stack** — agent-native wallet/transaction tooling.

## Reference implementations (organizer-provided)

| Repo | What it shows |
|------|---------------|
| `circlefin/arc-nanopayments` | End-to-end nanopayments: Next.js x402 seller + LangChain paying agent + Gateway batching |
| `the-canteen-dev/circle-agent` | "Arc 101" explainer: minimal x402 server + buyer + on-chain batch decoder |
| `circlefin/arc-commerce`, `arc-multichain-wallet`, `arc-escrow`, `arc-fintech`, `arc-p2p-payments`, `arc-stablecoin-fx`, `arc-defi-lending-and-borrowing`, `arc-prediction-markets` | Other Arc samples |

(Details on these repos in [03-stack-and-tooling.md](03-stack-and-tooling.md#reference-repositories).)

## Links

- Event page: https://lepton.thecanteenapp.com
- Luma: https://luma.com/5xcrazms
- Canteen Discord: https://discord.gg/rsVfYutFZg
- Arc builder Discord: https://discord.com/invite/buildonarc
- Submission form: https://forms.gle/SMqLaw2pMGDe58LFA
- Priority access passphrase: `SITEx2224`
- Arc docs (read first): https://docs.arc.network/llms.txt
- Circle docs (read first): https://developers.circle.com/llms.txt
