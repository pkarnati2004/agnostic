import {
  type ApiErrorBody,
  CoreError,
  type CoreErrorOptions,
  describeIssues,
} from "@agnostic/core";
import type { z } from "zod";

export class DaemonError extends CoreError {
  constructor(message: string, opts: CoreErrorOptions) {
    super(message, opts);
    this.name = "DaemonError";
  }
}

/**
 * The single place a typed error becomes an HTTP status. Every code here is a `CoreError.code`
 * thrown by core, the ledger, the registry or the daemon, so the CLI prints the same string the
 * API returns. An ambiguous id prefix is the caller's request being under-specified, not a
 * conflict, so it is 400 and the candidates go in the hint (ADR 004).
 */
const statusByCode: Record<string, number> = {
  unauthorized: 401,
  "repo-not-found": 404,
  "task-not-found": 404,
  "repo-exists": 409,
  "repo-id-registered": 409,
  // A task or a workspace is busy: the request was right, the moment was not.
  "folder-busy": 409,
  "task-active": 409,
  "session-not-running": 409,
  "request-invalid": 400,
  "ambiguous-id": 400,
  "path-not-found": 400,
  "path-not-directory": 400,
  "path-inside-worktrees": 400,
  "ag-file-malformed": 400,
  "ag-file-invalid": 400,
  "invalid-profile-id": 400,
  "harness-unknown": 400,
  "profile-required": 400,
  "harness-not-installed": 400,
  "base-invalid": 400,
  // Registry refusals are all "that combination cannot be launched", which is the caller's choice.
  "route-unsupported": 400,
  "provider-key-missing": 400,
  "server-not-found": 400,
};

export function httpStatus(code: string): number {
  return statusByCode[code] ?? 500;
}

/** Anything that is not one of our errors is a bug: the client learns nothing, the log learns all. */
export function errorBody(err: unknown): { status: number; body: ApiErrorBody } {
  if (!(err instanceof CoreError)) {
    return { status: 500, body: { error: { code: "internal", message: "internal error" } } };
  }
  return {
    status: httpStatus(err.code),
    body: {
      error: {
        code: err.code,
        message: err.message,
        ...(err.hint === undefined ? {} : { hint: err.hint }),
      },
    },
  };
}

/** Zod is the only thing that decides a request is malformed, so this is the only 400 for shape. */
export function requestInvalid(error: z.ZodError): DaemonError {
  return new DaemonError(`this request is not valid: ${describeIssues(error)}`, {
    code: "request-invalid",
    hint: "Check the field names and types against the agn API.",
    cause: error,
  });
}
