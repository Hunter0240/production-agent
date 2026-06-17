import { describe, expect, it } from "vitest";
import { stripRoleFromSchema } from "../src/mcp.js";

describe("stripRoleFromSchema", () => {
  it("removes role from properties and required", () => {
    const stripped = stripRoleFromSchema({
      type: "object",
      properties: {
        role: { type: "string" },
        doc_name: { type: "string" },
      },
      required: ["role", "doc_name"],
    });
    expect(stripped.properties).not.toHaveProperty("role");
    expect(stripped.properties).toHaveProperty("doc_name");
    expect(stripped.required).toEqual(["doc_name"]);
  });

  it("leaves schemas without a role untouched", () => {
    const stripped = stripRoleFromSchema({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });
    expect(stripped.properties).toHaveProperty("query");
    expect(stripped.required).toEqual(["query"]);
  });
});
