import { beforeEach, describe, expect, it } from "vitest";
import { checkChatAllowed, consume, recordUsage, resetForTest } from "../src/guardrails.js";
import { config } from "../src/config.js";

describe("guardrails", () => {
  beforeEach(() => resetForTest());

  it("allows a fresh session", () => {
    expect(checkChatAllowed("a".repeat(32)).ok).toBe(true);
  });

  it("blocks a session past its message limit", () => {
    const sid = "b".repeat(32);
    for (let i = 0; i < config.sessionMessageLimit; i++) consume(sid);
    const gate = checkChatAllowed(sid);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toContain("demo messages");
  });

  it("does not block a different session when one is exhausted", () => {
    const sid = "c".repeat(32);
    for (let i = 0; i < config.sessionMessageLimit; i++) consume(sid);
    expect(checkChatAllowed("d".repeat(32)).ok).toBe(true);
  });

  it("blocks everyone once the daily output-token budget is spent", () => {
    recordUsage(config.dailyOutputTokenLimit);
    const gate = checkChatAllowed("e".repeat(32));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toContain("daily budget");
  });

  it("blocks everyone once the daily request budget is spent", () => {
    for (let i = 0; i < config.dailyRequestLimit; i++) consume(`f${i}`.padEnd(32, "0"));
    expect(checkChatAllowed("g".repeat(32)).ok).toBe(false);
  });

  it("blocks one IP that rotates sessions past the per-IP daily limit", () => {
    const ip = "203.0.113.7";
    // distinct sessions each time, so the session cap never fires -- only the IP does
    for (let i = 0; i < config.ipDailyLimit; i++) consume(`s${i}`.padEnd(32, "0"), ip);
    const gate = checkChatAllowed("fresh".padEnd(32, "0"), ip);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toContain("address");
  });

  it("does not block a different IP when one IP is exhausted", () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < config.ipDailyLimit; i++) consume(`s${i}`.padEnd(32, "0"), ip);
    expect(checkChatAllowed("z".repeat(32), "198.51.100.2").ok).toBe(true);
  });
});
