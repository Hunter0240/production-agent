import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { runAgentTurn, type AgentEvent } from "./agent.js";
import { callTool, connectMcp } from "./mcp.js";
import { checkChatAllowed, consume, recordUsage } from "./guardrails.js";

const ROLES = [
  "producer",
  "production manager",
  "technical director",
  "stage manager",
  "A1",
  "camera operator",
  "A2",
  "utility",
];

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));

const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist",
);
app.use(express.static(clientDist));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/roles", (_req, res) => {
  res.json({ roles: ROLES, chatEnabled: config.chatEnabled });
});

app.get("/api/docs", async (req, res) => {
  const role = String(req.query.role ?? "");
  if (!ROLES.includes(role)) return res.status(400).json({ error: "unknown role" });
  try {
    res.json(JSON.parse(await callTool("list_documents", {}, role)));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "tool failure" });
  }
});

app.get("/api/doc", async (req, res) => {
  const role = String(req.query.role ?? "");
  const name = String(req.query.name ?? "");
  if (!ROLES.includes(role)) return res.status(400).json({ error: "unknown role" });
  if (!name || name.length > 200) return res.status(400).json({ error: "bad document name" });
  try {
    res.json(JSON.parse(await callTool("get_document", { doc_name: name }, role)));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "tool failure" });
  }
});

function sessionId(req: express.Request, res: express.Response): string {
  const existing = req.headers.cookie?.match(/pagent_session=([a-f0-9]{32})/)?.[1];
  if (existing) return existing;
  const id = crypto.randomBytes(16).toString("hex");
  res.setHeader("Set-Cookie", `pagent_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  return id;
}

interface ChatBody {
  role?: string;
  messages?: Array<{ role: string; content: string }>;
}

app.post("/api/chat", async (req, res) => {
  const body = req.body as ChatBody;
  const role = body.role ?? "";
  if (!ROLES.includes(role)) return res.status(400).json({ error: "unknown role" });

  const raw = body.messages ?? [];
  if (
    raw.length === 0 ||
    raw.length > config.maxHistoryMessages ||
    raw.some(
      (m) =>
        (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string" ||
        m.content.length === 0 ||
        m.content.length > config.maxMessageChars,
    ) ||
    raw[raw.length - 1].role !== "user"
  ) {
    return res.status(400).json({ error: "bad message history" });
  }

  const sid = sessionId(req, res);
  const gate = checkChatAllowed(sid);
  if (!gate.ok) return res.status(429).json({ error: gate.reason });
  consume(sid);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const send = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const history = raw.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  })) satisfies Anthropic.MessageParam[];

  try {
    const outputTokens = await runAgentTurn(history, role, send);
    recordUsage(outputTokens);
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : "agent failure" });
  }
  res.end();
});

app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

connectMcp()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`pagent web listening on :${config.port} (model=${config.model}, chat=${config.chatEnabled})`);
    });
  })
  .catch((err) => {
    console.error("failed to start MCP server:", err);
    process.exit(1);
  });
