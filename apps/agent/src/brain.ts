import Anthropic from "@anthropic-ai/sdk";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export interface BrainTurn { content: Block[]; stopReason: string | null }
export interface Brain { next(messages: Msg[]): Promise<BrainTurn> }

export class MockBrain implements Brain {
  #turns: BrainTurn[];
  constructor(turns: BrainTurn[]) { this.#turns = [...turns]; }
  async next(_messages?: Msg[]): Promise<BrainTurn> {
    const t = this.#turns.shift();
    if (!t) throw new Error("MockBrain exhausted");
    return t;
  }
}

export function makeAnthropicBrain(opts: { apiKey: string; system: string; tools: readonly unknown[]; effort?: string }): Brain {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async next(messages: Msg[]): Promise<BrainTurn> {
      const res = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: (opts.effort ?? "medium") as Anthropic.Messages.OutputConfig["effort"] },
        system: opts.system,
        tools: opts.tools as Anthropic.Tool[],
        messages: messages as Anthropic.MessageParam[],
      });
      // Keep only text + tool_use blocks (drop thinking) for our loop's purposes.
      const content = res.content
        .filter((b) => b.type === "text" || b.type === "tool_use")
        .map((b) => b.type === "text"
          ? { type: "text" as const, text: b.text }
          : { type: "tool_use" as const, id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      return { content, stopReason: res.stop_reason };
    },
  };
}
