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
});
