import { config } from "./config.js";

// In-memory counters are sound here because the Cloud Run service runs with
// max-instances=1; a second instance would get its own counters and double
// the effective budget.

interface DayCounters {
  date: string;
  requests: number;
  outputTokens: number;
}

const sessions = new Map<string, number>();
let day: DayCounters = { date: today(), requests: 0, outputTokens: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollover(): void {
  const d = today();
  if (day.date !== d) {
    day = { date: d, requests: 0, outputTokens: 0 };
    sessions.clear();
  }
}

export type GateResult = { ok: true } | { ok: false; reason: string };

export function checkChatAllowed(sessionId: string): GateResult {
  rollover();
  if (!config.chatEnabled) {
    return { ok: false, reason: "Live chat is currently disabled. The doc viewer stays open." };
  }
  if (day.requests >= config.dailyRequestLimit || day.outputTokens >= config.dailyOutputTokenLimit) {
    return { ok: false, reason: "The demo has hit its daily budget. Come back tomorrow, or browse the paperwork meanwhile." };
  }
  const used = sessions.get(sessionId) ?? 0;
  if (used >= config.sessionMessageLimit) {
    return { ok: false, reason: `This session has used its ${config.sessionMessageLimit} demo messages. The doc viewer stays open.` };
  }
  return { ok: true };
}

export function consume(sessionId: string): void {
  rollover();
  day.requests += 1;
  sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1);
}

export function recordUsage(outputTokens: number): void {
  rollover();
  day.outputTokens += outputTokens;
}

export function resetForTest(): void {
  sessions.clear();
  day = { date: today(), requests: 0, outputTokens: 0 };
}
