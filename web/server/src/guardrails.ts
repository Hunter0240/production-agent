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
// Per-IP daily counts. The session limit keys on a client-controlled cookie, so
// rotating the cookie bypasses it; the IP counter does not, which stops one
// actor from draining the global daily budget by minting fresh sessions.
const ips = new Map<string, number>();
let day: DayCounters = { date: today(), requests: 0, outputTokens: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollover(): void {
  const d = today();
  if (day.date !== d) {
    day = { date: d, requests: 0, outputTokens: 0 };
    sessions.clear();
    ips.clear();
  }
}

export type GateResult = { ok: true } | { ok: false; reason: string };

export function checkChatAllowed(sessionId: string, ip?: string): GateResult {
  rollover();
  if (!config.chatEnabled) {
    return { ok: false, reason: "Live chat is currently disabled. The doc viewer stays open." };
  }
  if (day.requests >= config.dailyRequestLimit || day.outputTokens >= config.dailyOutputTokenLimit) {
    return { ok: false, reason: "The demo has hit its daily budget. Come back tomorrow, or browse the paperwork meanwhile." };
  }
  if (ip && (ips.get(ip) ?? 0) >= config.ipDailyLimit) {
    return { ok: false, reason: "This address has used its share of the demo for today. The doc viewer stays open." };
  }
  const used = sessions.get(sessionId) ?? 0;
  if (used >= config.sessionMessageLimit) {
    return { ok: false, reason: `This session has used its ${config.sessionMessageLimit} demo messages. The doc viewer stays open.` };
  }
  return { ok: true };
}

export function consume(sessionId: string, ip?: string): void {
  rollover();
  day.requests += 1;
  sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1);
  if (ip) ips.set(ip, (ips.get(ip) ?? 0) + 1);
}

export function recordUsage(outputTokens: number): void {
  rollover();
  day.outputTokens += outputTokens;
}

export function resetForTest(): void {
  sessions.clear();
  ips.clear();
  day = { date: today(), requests: 0, outputTokens: 0 };
}
