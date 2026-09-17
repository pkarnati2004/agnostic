import type { Repo } from "@agnostic/core";
import { DaemonError } from "./error.js";

/**
 * ADR 032: closing a repo hides it, and a close is refused while a task is live, so nothing may
 * start a new one in a closed repo either - it would run where the user cannot see it. Every way
 * into a session (run, resume, handoff, adopt) asks this first.
 */
export function assertRepoOpen(repo: Repo): void {
  if (repo.status !== "archived") {
    return;
  }
  throw new DaemonError(`repo ${repo.name} is closed`, {
    code: "repo-closed",
    hint: `Run \`agn repo open ${repo.id}\` first.`,
  });
}
