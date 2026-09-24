import { z } from "zod";

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

/** JSON-RPC 2.0 allows a string or a number, and the server echoes back what it was sent. */
export type JsonRpcId = string | number;

export type JsonRpcRequest = { id: JsonRpcId; method: string; params: Record<string, unknown> };
export type JsonRpcNotification = { method: string; params: Record<string, unknown> };

export type Incoming =
  | { kind: "request"; request: JsonRpcRequest }
  | { kind: "notification"; notification: JsonRpcNotification }
  /** A result or an error: an answer to a request this server never sent. */
  | { kind: "ignored" }
  | {
      kind: "invalid";
      id: JsonRpcId | null;
      code: typeof PARSE_ERROR | typeof INVALID_REQUEST;
      message: string;
    };

const IdSchema = z.union([z.string().min(1), z.number()]);

// Loose, because 2025-06-18 lets a client add `_meta` to any message and a newer revision may add
// more; the four keys agn reads are the ones checked.
const MessageSchema = z.looseObject({
  jsonrpc: z.literal("2.0"),
  id: IdSchema.optional(),
  method: z.string().min(1).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/** One line of stdin, which is one message: the boundary where unknown input becomes a type. */
export function parseIncoming(line: string): Incoming {
  const json = parseJson(line);
  if (!json.ok) {
    return {
      kind: "invalid",
      id: null,
      code: PARSE_ERROR,
      message: `parse error: ${json.message}`,
    };
  }
  const message = MessageSchema.safeParse(json.value);
  if (!message.success) {
    // A batch is a JSON array, and 2025-06-18 dropped batching, so it lands here with the rest.
    return {
      kind: "invalid",
      id: idOf(json.value),
      code: INVALID_REQUEST,
      message: "invalid request: not a JSON-RPC 2.0 message",
    };
  }
  const { id, method, params = {} } = message.data;
  if (method === undefined) {
    return { kind: "ignored" };
  }
  return id === undefined
    ? { kind: "notification", notification: { method, params } }
    : { kind: "request", request: { id, method, params } };
}

export function resultMessage(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

export function errorMessage(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): string {
  const error = { code, message, ...(data === undefined ? {} : { data }) };
  return JSON.stringify({ jsonrpc: "2.0", id, error });
}

type Parsed = { ok: true; value: unknown } | { ok: false; message: string };

function parseJson(line: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(line) as unknown };
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** An invalid request still gets its answer addressed, when the id is the one readable part. */
function idOf(value: unknown): JsonRpcId | null {
  const parsed = z.object({ id: IdSchema }).safeParse(value);
  return parsed.success ? parsed.data.id : null;
}
