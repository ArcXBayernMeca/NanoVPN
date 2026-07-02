import { AGENT_PROMPT, EGRESS_ENDPOINT_FACTS } from "@/lib/agent-prompt";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "NanoVPN — use with your agent" };

export default function UseWithAgentPage() {
  return (
    <main className="onb" data-rise>
      <span className="eyebrow">For developers</span>
      <h1>Give your AI agent <b>pay-per-use internet</b></h1>
      <p className="onb__lede">Geo-located egress, paid in USDC per request over x402 on Arc — no subscription, no account.</p>
      <div className="onb__flow"><span>POST /egress</span><i>→</i><span>402 challenge</span><i>→</i><span>sign + retry</span><i>→</i><span>200 + egress IP</span></div>

      <section className="onb__sec onb__step">
        <span className="onb__num">1</span>
        <div className="onb__stepbody">
          <div className="onb__head"><span className="eyebrow">Paste this into your agent</span><CopyButton text={AGENT_PROMPT} label="Copy prompt" /></div>
          <div className="onb__codewrap"><span className="onb__codetag">PROMPT</span><pre className="onb__code">{AGENT_PROMPT}</pre></div>
        </div>
      </section>

      <section className="onb__sec onb__step">
        <span className="onb__num">2</span>
        <div className="onb__stepbody">
          <span className="eyebrow">Or call it directly</span>
          <div className="onb__codewrap"><span className="onb__codetag">JS</span><pre className="onb__code">await buyer.pay("https://&lt;node-host&gt;/egress?url=" + encodeURIComponent(url), {`{ method: "POST" }`})</pre></div>
        </div>
      </section>

      <section className="onb__sec">
        <span className="eyebrow">Endpoint reference</span>
        <table className="onb__spec"><tbody>
          <tr><th>Endpoint</th><td><code>{EGRESS_ENDPOINT_FACTS.url}</code></td></tr>
          <tr><th>Network</th><td><code>{EGRESS_ENDPOINT_FACTS.network}</code></td></tr>
          <tr><th>Scheme</th><td><code>{EGRESS_ENDPOINT_FACTS.scheme} (Circle Gateway batched)</code></td></tr>
          <tr><th>Price</th><td><code>~${EGRESS_ENDPOINT_FACTS.pricePerRequestUsd}/request</code></td></tr>
        </tbody></table>
        <p className="hint">Machine-readable: <a href="/agent-onboarding">/agent-onboarding</a> · <a href="/llms.txt">/llms.txt</a></p>
      </section>
    </main>
  );
}
