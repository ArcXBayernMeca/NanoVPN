import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "NanoVPN — use with your agent" };

export default function UseWithAgentPage() {
  return (
    <main className="onb">
      <h1>Give your AI agent <b>pay-per-use internet</b></h1>
      <p className="onb__lede">Geo-located egress, paid in USDC per request over x402 on Arc — no subscription, no account.</p>
      <div className="onb__flow"><span>POST /egress</span><i>→</i><span>402 challenge</span><i>→</i><span>sign + retry</span><i>→</i><span>200 + egress IP</span></div>

      <section className="onb__sec">
        <div className="onb__head"><span className="eyebrow">1 · Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
        <pre className="onb__code">{AGENT_PROMPT}</pre>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">2 · Or call it directly</span>
        <pre className="onb__code">await buyer.pay("https://&lt;node-host&gt;/egress?url=" + encodeURIComponent(url), {`{ method: "POST" }`})</pre>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">Endpoint reference</span>
        <ul className="onb__facts">
          <li><b>Endpoint</b><code>{EGRESS_ENDPOINT_FACTS.url}</code></li>
          <li><b>Network</b><code>{EGRESS_ENDPOINT_FACTS.network}</code></li>
          <li><b>Scheme</b><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></li>
          <li><b>Price</b><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></li>
        </ul>
        <p className="hint">Machine-readable: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
}
