import { isDirectory, type Repo } from "@agnostic/core";
import { DaemonError } from "./error.js";

/**
 * ADR 032: a close is refused while a task is live, so nothing may start a new session in a closed
 * repo either - it would run where the user cannot see it. ADR 034: the same for a removed repo,
 * and for one whose directory is not on disk, where every git call would fail anyway. The row's
 * own state is read before the disk. Every way into a session (run, resume, handoff, adopt) asks
 * this first.
 */
export async function assertRepoUsable(repo: Repo): Promise<void> {
  if (repo.status === "removed") {
    throw new DaemonError(`repo ${repo.name} was removed`, {
      code: "repo-removed",
      hint: `Run \`agn add ${repo.path}\` to register it again.`,
    });
  }
  if (repo.status === "archived") {
    throw new DaemonError(`repo ${repo.name} is closed`, {
      code: "repo-closed",
      hint: `Run \`agn repo open ${repo.id}\` first.`,
    });
  }
  if (!(await isDirectory(repo.path))) {
    throw new DaemonError(`the folder for repo ${repo.name} is not there: ${repo.path}`, {
      code: "repo-missing",
      hint: `Mount or restore it, or run \`agn repo remove ${repo.id}\`.`,
    });
  }
}
