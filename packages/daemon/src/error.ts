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
  // ADR 026: a page on another origin may not reach a daemon that answers on loopback.
  "origin-forbidden": 403,
  "not-found": 404,
  "repo-not-found": 404,
  "hook-unsupported": 404,
  "hook-task-unknown": 404,
  "task-not-found": 404,
  // No task carries this compare id, so there is no group to read or pick from.
  "compare-not-found": 404,
  // Nothing was built to serve: the route exists, the files do not.
  "ui-not-built": 404,
  "repo-exists": 409,
  "repo-id-registered": 409,
  // A task or a workspace is busy: the request was right, the moment was not.
  "folder-busy": 409,
  // A repo with a live task cannot be closed: the task would be hidden while it runs (ADR 032).
  "repo-busy": 409,
  // The mirror of that rule: nothing starts a task in a closed repo, because nothing would show it.
  "repo-closed": 409,
  // The repo's own folder is not on disk, so there is nowhere to run (ADR 034).
  "repo-missing": 409,
  // The repo was removed: `agn add` of its path brings the row, and its history, back.
  "repo-removed": 409,
  "task-active": 409,
  "session-not-running": 409,
  "session-not-attachable": 409,
  // The worktree a task ran in is gone and so is the branch a resume would rebuild it from, so
  // there is nothing left to continue; a worktree gone on its own is rebuilt, not refused.
  "worktree-cleaned": 409,
  // The worktree still holds work no commit is keeping: the user decides, with --force or a commit.
  "worktree-unsaved": 409,
  // A generated file was written by hand, or two instructions files disagree: the user decides.
  "sync-conflict": 409,
  "init-ambiguous-source": 409,
  "init-source-generated": 409,
  // The parent's branch was deleted, so there is nothing for the next agent to continue from.
  "branch-gone": 409,
  // The editor is installed and did not start: the machine's state now, not the request's fault.
  "editor-failed": 409,
  // The machine has spent its ceiling for the window: the moment, not the request (ADR 036 Q9).
  "budget-exceeded": 409,
  // A folder workspace has no git to read a diff from; `git init` is what changes that (ADR 001).
  "repo-not-git": 409,
  // The repo has no origin, or one agn cannot open a pull request against: the repo's state.
  "remote-missing": 409,
  "remote-not-github": 409,
  // git would not move the branch - usually the remote is ahead. Nothing here can decide that.
  "push-rejected": 409,
  // There is nothing to open a pull request for yet, or nothing to open it against.
  "branch-empty": 409,
  "branch-is-base": 409,
  // No `base_branch`, no `origin/HEAD` and a detached checkout: agn will not guess what to diff.
  "base-unresolved": 409,
  // The session found under the path is already a task: the request was right, it is just done.
  "adopt-already-adopted": 409,
  // Nothing on this machine may write a spec: the user writes it themselves, or names a profile.
  "spec-writer-unavailable": 409,
  // The named profile's harness or route has no one-shot form: the same refusal from the registry.
  "headless-unsupported": 409,
  // The daemon reached out and the far side did not answer: neither a bad request nor a bug.
  "catalog-fetch-failed": 502,
  "spec-writer-failed": 502,
  // gh ran and refused: GitHub, not agn, decided. The compare page is still open to the user.
  "gh-failed": 502,
  // git could not be asked - a lock, a timeout, a git that would not run. Nothing was decided and
  // nothing is wrong with the request, so the caller retries.
  "git-unavailable": 503,
  "request-invalid": 400,
  "ambiguous-id": 400,
  "path-not-found": 400,
  "path-not-directory": 400,
  "path-inside-worktrees": 400,
  "ag-file-malformed": 400,
  "ag-file-invalid": 400,
  // Nothing to generate from, or nothing to seed from: `agn init` is the next step either way.
  "instructions-missing": 400,
  "init-source-missing": 400,
  "invalid-profile-id": 400,
  "harness-unknown": 400,
  "profile-required": 400,
  // Nothing on this machine may run the task: preferences or a missing install, both the user's.
  "no-eligible-profile": 400,
  "harness-not-installed": 400,
  // Two of a compare's agents are the same profile, so one of them would prove nothing.
  "compare-profiles-duplicate": 400,
  // The task to keep has to be one of the compare's own; any other id is the caller's slip.
  "compare-not-sibling": 400,
  "hook-payload-invalid": 400,
  // A hook config agn will not read over or write into is the file's state, not a fault in agn.
  "hook-config-unreadable": 400,
  "hook-config-unwritable": 400,
  "hook-payload-too-large": 413,
  "base-invalid": 400,
  // An editor agn cannot see is the machine's state; the caller picks from the ones it can.
  "editor-not-found": 400,
  "editor-none": 400,
  "path-outside-repo": 400,
  "adopt-pid-not-found": 400,
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

/** The one 404 for a path nobody serves, whether it arrived as a request or as an upgrade. */
export function noRoute(path: string): DaemonError {
  return new DaemonError(`no route for ${path}`, {
    code: "not-found",
    hint: "Check the path against the agn API; a task's terminal is at /tasks/<id>/terminal.",
  });
}

/** Zod is the only thing that decides a request is malformed, so this is the only 400 for shape. */
export function requestInvalid(error: z.ZodError): DaemonError {
  return new DaemonError(`this request is not valid: ${describeIssues(error)}`, {
    code: "request-invalid",
    hint: "Check the field names and types against the agn API.",
    cause: error,
  });
}
