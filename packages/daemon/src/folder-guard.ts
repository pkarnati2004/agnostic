import type { Repo, Task } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import { DaemonError } from "./error.js";

const OPEN: Task["status"][] = ["queued", "running", "waiting"];

/**
 * ADR 001: a folder repo has one working tree, so it runs one task at a time. Callers run
 * this inside the transaction that starts a task, so two arrivals cannot both see an empty list.
 * `except` is the task being started, which is already in the ledger when it is resumed.
 */
export function assertFolderFree(ledger: Ledger, repo: Repo, except: string | null = null): void {
  if (repo.kind !== "folder") {
    return;
  }
  const busy = ledger.tasks
    .list({ repoId: repo.id, status: OPEN })
    .filter((row) => row.id !== except);
  if (busy.length === 0) {
    return;
  }
  throw new DaemonError("folder repos run one task at a time; git init to run tasks in parallel.", {
    code: "folder-busy",
    hint: `Run \`agn stop ${busy[0]?.id}\` first, or \`git init\` in ${repo.path}.`,
  });
}
