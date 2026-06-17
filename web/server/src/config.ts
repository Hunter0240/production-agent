function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const openrouterApiKey = process.env.OPENROUTER_API_KEY;

export const config = {
  port: intEnv("PORT", 8080),
  openrouterApiKey,
  model: process.env.PAGENT_MODEL ?? (openrouterApiKey ? "anthropic/claude-opus-4.8" : "claude-opus-4-8"),
  showPath: process.env.PAGENT_SHOW ?? "../shows/sample-show",
  mcpCommand: process.env.PAGENT_MCP_COMMAND ?? "pagent",

  chatEnabled: process.env.CHAT_ENABLED !== "false",

  maxTokensPerResponse: intEnv("MAX_TOKENS_PER_RESPONSE", 1024),
  maxAgentIterations: intEnv("MAX_AGENT_ITERATIONS", 8),
  maxHistoryMessages: intEnv("MAX_HISTORY_MESSAGES", 24),
  maxMessageChars: intEnv("MAX_MESSAGE_CHARS", 2000),

  sessionMessageLimit: intEnv("SESSION_MESSAGE_LIMIT", 10),
  dailyRequestLimit: intEnv("DAILY_REQUEST_LIMIT", 300),
  dailyOutputTokenLimit: intEnv("DAILY_OUTPUT_TOKEN_LIMIT", 200000),
};
