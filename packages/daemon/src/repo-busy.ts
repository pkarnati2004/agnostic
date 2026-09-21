import type { Repo } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";

/** Close and remove both hide a repo, so a live task in it would be hidden too: stop it first. */
export function refuseWhileBusy(ctx: DaemonContext, repo: Repo): void {
  const busy = ctx.ledger.tasks.list({ repoId: repo.id, status: ["running", "waiting"] })[0];
  if (busy === undefined) {
    return;
  }
  throw new DaemonError(`repo ${repo.name} has a task that is still ${busy.status}`, {
    code: "repo-busy",
    hint: `Run \`agn stop ${busy.id}\` first.`,
  });
}
