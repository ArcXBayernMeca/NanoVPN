import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "NanoVPN — use with your agent" };

export default function DevelopersPage() {
  return (
    <main className="dev-page">
      <h1>Use NanoVPN with your AI agent</h1>
      <p className="dev-lede">Give any AI agent pay-per-use, geo-located internet egress. It pays USDC per request over x402 on Arc — no subscription, no account.</p>

      <section className="dev-sec">
        <div className="dev-sec__head"><span className="eyebrow">Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
        <pre className="dev-code">{AGENT_PROMPT}</pre>
      </section>

      <section className="dev-sec">
        <span className="eyebrow">Endpoint</span>
        <ul className="dev-facts">
          <li><b>Endpoint</b><code>{EGRESS_ENDPOINT_FACTS.url}</code></li>
          <li><b>Network</b><code>{EGRESS_ENDPOINT_FACTS.network}</code></li>
          <li><b>Scheme</b><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></li>
          <li><b>Price</b><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></li>
        </ul>
        <p className="hint">Full machine-readable docs: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
}
