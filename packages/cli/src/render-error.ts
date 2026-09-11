import { type ApiErrorBody, CoreError, DaemonApiError } from "@agnostic/core";
import { CommanderError } from "commander";

type RenderedError = { lines: string[]; exitCode: 1 | 2; body: ApiErrorBody };

/** One place decides what a failure looks like, so `--json` and the human form cannot drift. */
export function renderError(err: unknown): RenderedError {
  if (err instanceof CommanderError) {
    return { lines: [err.message], exitCode: 2, body: body("usage", err.message) };
  }
  if (err instanceof CoreError) {
    return {
      lines: coreErrorLines(err),
      exitCode: 1,
      body: body(err.code, err.message, err.hint),
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    lines: [`agn: unexpected error: ${message}`],
    exitCode: 1,
    body: body("internal", `unexpected error: ${message}`),
  };
}

function coreErrorLines(err: CoreError): string[] {
  if (err instanceof DaemonApiError && err.code === "ambiguous-id") {
    const candidates = idsIn(err.hint);
    if (candidates.length > 0) {
      return [
        `agn: ${err.message}`,
        ...candidates.map((id) => `  ${id}`),
        "  pass more characters",
      ];
    }
  }
  return [`agn: ${err.message}`, ...(err.hint === undefined ? [] : [`  hint: ${err.hint}`])];
}

// The daemon lists the matches at the end of the hint ("Type more of the id: abc123, abc789").
function idsIn(hint: string | undefined): string[] {
  const listed = (hint ?? "").split(":").slice(1).join(":");
  return listed
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

function body(code: string, message: string, hint?: string): ApiErrorBody {
  return { error: { code, message, ...(hint === undefined ? {} : { hint }) } };
}
