import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { describeIssues } from "@agnostic/core";
import { z } from "zod";
import type { CliContext } from "../context.js";
import {
  errorMessage,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  type JsonRpcId,
  METHOD_NOT_FOUND,
  parseIncoming,
  resultMessage,
} from "./json-rpc.js";
import { type McpTool, type ToolResult, toolDefinition, toolError, toolResult } from "./tool.js";
import { findTool, tools } from "./tools.js";

/** The revision agn implements. The server answers with it whatever the client asked for. */
const PROTOCOL_VERSION = "2025-06-18";

const INSTRUCTIONS =
  "agn runs coding agents on tasks. Each task gets a git worktree and a branch of its own, its own agent session, and a record of what it changed and what it cost. agn_status and agn_task read that state, agn_recommend says which agent suits a prompt, and agn_run starts an agent on a task in its own worktree and answers at once - the agent goes on working after the call has returned. agn_stop ends a session, agn_resume brings one back, and agn_handoff passes a task's work to another agent with a note.";

const CallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export type McpStreams = { input: Readable; output: Writable };

/**
 * One JSON-RPC message per line in, one per line out, until `input` ends. Requests are answered as
 * they complete rather than in order, which their ids make legal, so a slow `agn_run` does not hold
 * a `ping` behind it. Nothing but protocol lines is ever written to `output`.
 */
export async function serveMcp(
  ctx: CliContext,
  version: string,
  streams: McpStreams,
): Promise<void> {
  const lines = createInterface({ input: streams.input, crlfDelay: Number.POSITIVE_INFINITY });
  const pending = new Set<Promise<void>>();
  for await (const line of lines) {
    if (line.trim() === "") {
      continue;
    }
    const answered = answer(ctx, version, line, streams.output);
    pending.add(answered);
    void answered.finally(() => pending.delete(answered));
  }
  // The client closed its end; a call still in flight has an answer coming, and it gets to send it.
  await Promise.all(pending);
}

async function answer(
  ctx: CliContext,
  version: string,
  line: string,
  output: Writable,
): Promise<void> {
  const incoming = parseIncoming(line);
  if (incoming.kind === "invalid") {
    write(output, errorMessage(incoming.id, incoming.code, incoming.message));
    return;
  }
  // A notification is never answered, and neither is a response to a request agn never sent.
  if (incoming.kind !== "request") {
    return;
  }
  const { id, method, params } = incoming.request;
  write(output, await dispatch(ctx, version, id, method, params));
}

async function dispatch(
  ctx: CliContext,
  version: string,
  id: JsonRpcId,
  method: string,
  params: Record<string, unknown>,
): Promise<string> {
  switch (method) {
    case "initialize":
      return resultMessage(id, initializeResult(version));
    case "ping":
      return resultMessage(id, {});
    case "tools/list":
      return resultMessage(id, { tools: tools.map(toolDefinition) });
    case "tools/call":
      return await call(ctx, id, params);
    default:
      return errorMessage(id, METHOD_NOT_FOUND, `method not found: ${method}`);
  }
}

function initializeResult(version: string): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "agn", version },
    instructions: INSTRUCTIONS,
  };
}

async function call(
  ctx: CliContext,
  id: JsonRpcId,
  params: Record<string, unknown>,
): Promise<string> {
  const parsed = CallParamsSchema.safeParse(params);
  if (!parsed.success) {
    return errorMessage(id, INVALID_PARAMS, "invalid params", describeIssues(parsed.error));
  }
  const tool = findTool(parsed.data.name);
  if (tool === null) {
    return errorMessage(id, INVALID_PARAMS, `unknown tool: ${parsed.data.name}`);
  }
  const args = tool.schema.safeParse(parsed.data.arguments ?? {});
  if (!args.success) {
    const message = `invalid arguments for ${tool.name}`;
    return errorMessage(id, INVALID_PARAMS, message, describeIssues(args.error));
  }
  return await invoke(ctx, id, tool, args.data);
}

async function invoke(
  ctx: CliContext,
  id: JsonRpcId,
  tool: McpTool<unknown>,
  args: unknown,
): Promise<string> {
  try {
    return resultMessage(id, await callResult(ctx, tool, args));
  } catch (cause) {
    // Nothing agn has a code for: a bug here, said on stderr because stdout is the protocol.
    ctx.io.err(`agn mcp: ${tool.name} failed: ${cause instanceof Error ? cause.message : cause}`);
    return errorMessage(id, INTERNAL_ERROR, "internal error");
  }
}

/** A CoreError is an answer the agent can read; anything else travels on to become -32603. */
async function callResult(
  ctx: CliContext,
  tool: McpTool<unknown>,
  args: unknown,
): Promise<ToolResult> {
  try {
    return toolResult(await tool.run(ctx, args));
  } catch (cause) {
    return toolError(cause);
  }
}

function write(output: Writable, message: string): void {
  output.write(`${message}\n`);
}
