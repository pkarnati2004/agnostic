import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { type McpTool, toolDefinition, toolError, toolResult } from "./tool.js";
import { findTool } from "./tools.js";

type JsonSchema = {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, { enum?: string[] }>;
  $schema?: string;
};

function tool(name: string): McpTool<unknown> {
  const found = findTool(name);
  if (found === null) {
    throw new Error(`${name} is not a tool`);
  }
  return found;
}

function inputSchema(name: string): JsonSchema {
  return toolDefinition(tool(name)).inputSchema as JsonSchema;
}

describe("toolDefinition", () => {
  it("renders the run tool's request schema as a JSON Schema object", () => {
    const schema = inputSchema("agn_run");
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("prompt");
    expect(schema.additionalProperties).toBe(false);
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.properties?.intent?.enum).toEqual([
      "implement",
      "debug",
      "refactor",
      "review",
      "research",
      "ui",
      "design",
      "general",
    ]);
  });

  it("marks a read tool read-only and leaves the annotation off a write tool", () => {
    expect(toolDefinition(tool("agn_status")).annotations).toEqual({ readOnlyHint: true });
    expect(toolDefinition(tool("agn_run")).annotations).toBeUndefined();
  });

  it("gives every tool a name a client accepts and a description", () => {
    const definition = toolDefinition(tool("agn_handoff"));
    expect(definition.name).toMatch(/^[a-z0-9_]+$/);
    expect(definition.description.length).toBeGreaterThan(40);
  });
});

describe("toolResult", () => {
  it("carries the daemon's JSON as text a client can parse back", () => {
    const value = { task: { id: "t3n9v2wxyz" } };
    const result = toolResult(value);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(value);
  });
});

describe("toolError", () => {
  it("turns an error agn has a code for into an isError result with its hint", () => {
    const cause = new DaemonApiError("task nope was not found", {
      code: "task-not-found",
      hint: "Run `agn status --all`.",
      status: 404,
    });
    const result = toolError(cause);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "task-not-found: task nope was not found\nhint: Run `agn status --all`.",
    );
  });

  it("leaves the hint line out when there is no hint", () => {
    const cause = new DaemonApiError("no", { code: "daemon-unreachable", status: null });
    expect(toolError(cause).content[0].text).toBe("daemon-unreachable: no");
  });

  it("rethrows anything else, which the server answers as an internal error", () => {
    expect(() => toolError(new Error("boom"))).toThrow("boom");
  });
});
