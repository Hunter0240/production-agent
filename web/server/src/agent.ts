import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { callTool, listAnthropicTools } from "./mcp.js";

const client = config.openrouterApiKey
  ? new Anthropic({
      apiKey: config.openrouterApiKey,
      baseURL: "https://openrouter.ai/api",
    })
  : new Anthropic();

const SYSTEM_PROMPT = `You are the Production Agent (PA) for a live broadcast show. You answer the crew's questions from the show's production paperwork, exactly the way the production office would.

The user is a crew member whose role is: {role}. Every document and tool result you see has already been filtered to what that role is cleared to see. If a tool returns a permission denial, relay it plainly and do not speculate about the withheld content.

Ground every answer in the paperwork via your tools; do not invent show details. Answer in the brisk, plain voice of a busy production office: short, specific, no filler. If the paperwork does not contain the answer, say so.

Do not narrate your steps or announce which document you are about to check. Use your tools silently, then reply with only the answer.

All show times are local to the venue. State the timezone label the tools return (for this show, PT) whenever you give a time, for example "camera call is 09:00 PT". Rundown segment start times come back as a time-of-day clock (front_time).`;

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: Record<string, unknown> }
  | { type: "denied"; name: string; detail: string }
  | { type: "done"; outputTokens: number }
  | { type: "error"; message: string };

// The tools return a structured `{ error: "permission_denied", detail }` when a
// role is not cleared for what it asked. Surface that as a typed event so the UI
// can render the access boundary explicitly, instead of only relaying the
// agent's phrasing of it.
function permissionDenial(result: string): string | null {
  try {
    const parsed = JSON.parse(result) as { error?: string; detail?: string };
    if (parsed && parsed.error === "permission_denied") {
      return parsed.detail ?? "Not cleared for this role.";
    }
  } catch {
    // tool results that are not a single JSON object are never denials
  }
  return null;
}

export async function runAgentTurn(
  history: Anthropic.MessageParam[],
  role: string,
  emit: (event: AgentEvent) => void,
): Promise<number> {
  const tools = await listAnthropicTools();
  const messages: Anthropic.MessageParam[] = [...history];
  let totalOutputTokens = 0;

  for (let i = 0; i < config.maxAgentIterations; i++) {
    const stream = client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokensPerResponse,
      system: SYSTEM_PROMPT.replace("{role}", role),
      tools,
      messages,
    });

    stream.on("text", (text) => emit({ type: "text", text }));

    const response = await stream.finalMessage();
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason !== "tool_use") {
      emit({ type: "done", outputTokens: totalOutputTokens });
      return totalOutputTokens;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      emit({ type: "tool", name: block.name, input: block.input as Record<string, unknown> });
      let result: string;
      let isError = false;
      try {
        result = await callTool(block.name, block.input as Record<string, unknown>, role);
        const denial = permissionDenial(result);
        if (denial) emit({ type: "denied", name: block.name, detail: denial });
      } catch (err) {
        result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  emit({ type: "error", message: "The agent hit its tool-call limit for one question. Try a narrower question." });
  return totalOutputTokens;
}
