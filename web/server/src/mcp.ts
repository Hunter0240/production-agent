import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

// The web app's trust model mirrors the Python server's pinned mode, per
// session instead of per process: the role selected in the UI is injected
// into every tool call server-side, and the role parameter is stripped from
// the schemas the model sees, so the model can neither choose nor escalate
// a role.

let client: Client | null = null;

export async function connectMcp(): Promise<Client> {
  if (client) return client;
  const transport = new StdioClientTransport({
    command: config.mcpCommand,
    args: ["--show", config.showPath],
  });
  const c = new Client({ name: "pagent-web", version: "0.1.0" });
  await c.connect(transport);
  client = c;
  return c;
}

interface JsonSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export function stripRoleFromSchema(schema: JsonSchema): JsonSchema {
  const properties = { ...(schema.properties ?? {}) };
  delete properties.role;
  const required = (schema.required ?? []).filter((r) => r !== "role");
  return { ...schema, properties, required };
}

export async function listAnthropicTools(): Promise<Anthropic.Tool[]> {
  const mcp = await connectMcp();
  const { tools } = await mcp.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: stripRoleFromSchema(t.inputSchema as JsonSchema),
  }));
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  role: string,
): Promise<string> {
  const mcp = await connectMcp();
  const result = await mcp.callTool({
    name,
    arguments: { ...args, role },
  });
  const content = result.content as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}
