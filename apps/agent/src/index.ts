import { prepareRun } from "./runner";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const goal = arg("goal");
  const budgetUsd = Number(arg("budget", "0.5"));
  const nodeId = process.argv.includes("--node") ? arg("node") : undefined; // omit → the agent picks
  const mock = hasFlag("mock");
  const { runId, run } = await prepareRun({ goal, budgetUsd, nodeId, mock });
  console.log(`[agent] run ${runId} — goal=${JSON.stringify(goal)} budget=$${budgetUsd} node=${nodeId ?? "(agent picks)"} mock=${mock || !process.env.ANTHROPIC_API_KEY}`);
  const out = await run();
  console.log(`[agent] ${out.status}: ${out.result}`);
  process.exit(out.status === "succeeded" ? 0 : 1);
}
main().catch((e) => { console.error("[agent] fatal:", e); process.exit(1); });
