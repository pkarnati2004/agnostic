import { CoreError } from "@agnostic/core";
import { z } from "zod";
import type { CliContext } from "../context.js";
import { CliError } from "../error.js";
import { worktreeTaskId } from "../resolve-repo.js";

/** What `tools/list` answers with, per MCP 2025-06-18. */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
};

export type McpTool<T> = {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  readOnly: boolean;
  /** The JSON the daemon answered, or an object composed from more than one of its answers. */
  run(ctx: CliContext, args: T): Promise<unknown>;
};

export type ToolResult = { content: [{ type: "text"; text: string }]; isError?: true };

export function toolDefinition(tool: McpTool<unknown>): ToolDefinition {
  const inputSchema: Record<string, unknown> = { ...z.toJSONSchema(tool.schema) };
  // The dialect belongs to a document, and an inputSchema is a fragment of the tool definition.
  delete inputSchema.$schema;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema,
    ...(tool.readOnly ? { annotations: { readOnlyHint: true } } : {}),
  };
}

/** The same bytes `--json` prints, so an agent reading a tool result reads agn's documented shape. */
export function toolResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * A failure agn has a code for is an answer, not a protocol error: the agent reads it and can act
 * on the hint. Anything else is a bug here, so it travels on to become a JSON-RPC internal error.
 */
export function toolError(cause: unknown): ToolResult {
  if (!(cause instanceof CoreError)) {
    throw cause;
  }
  const lines = [`${cause.code}: ${cause.message}`];
  if (cause.hint !== undefined) {
    lines.push(`hint: ${cause.hint}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/** Four tools take nothing but a task, and they all take it under this name. */
export const TaskArgumentSchema = z.strictObject({ task: z.string().min(1).optional() });

/**
 * The task a tool works on: its `task` argument, or the task of the worktree the server was
 * started in. A server the user started somewhere else has to be told which task they mean.
 */
export async function requireTask(
  ctx: CliContext,
  tool: string,
  argument: string | undefined,
): Promise<string> {
  const taskId = await worktreeTaskId(ctx, argument);
  if (taskId === null) {
    throw new CliError(`${tool} needs a task id, or a task worktree as the working directory`, {
      code: "task-required",
      hint: "Pass task, or list the tasks with agn_status and pass the id you want.",
    });
  }
  return taskId;
}
