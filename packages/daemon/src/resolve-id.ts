import type { Repo, Task } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import { DaemonError } from "./error.js";

/** Short enough to type, long enough that two ids rarely collide in one workspace (ADR 004). */
const MIN_PREFIX = 3;

export function resolveRepoId(ledger: Ledger, idOrPrefix: string): Repo {
  const exact = ledger.repos.get(idOrPrefix);
  if (exact !== null) {
    return exact;
  }
  const matches = byPrefix(idOrPrefix, () =>
    ledger.repos.list().filter((repo) => repo.id.startsWith(idOrPrefix)),
  );
  return one(matches, idOrPrefix, { noun: "repo", list: "agn repos" });
}

export function resolveTaskId(ledger: Ledger, idOrPrefix: string): Task {
  const exact = ledger.tasks.get(idOrPrefix);
  if (exact !== null) {
    return exact;
  }
  const matches = byPrefix(idOrPrefix, () => ledger.tasks.list({ idPrefix: idOrPrefix }));
  return one(matches, idOrPrefix, { noun: "task", list: "agn ls" });
}

/** Under three characters a prefix would match half the workspace, so it is not a prefix at all. */
function byPrefix<T>(idOrPrefix: string, lookup: () => T[]): T[] {
  return idOrPrefix.length < MIN_PREFIX ? [] : lookup();
}

function one<T extends { id: string }>(
  matches: T[],
  idOrPrefix: string,
  of: { noun: string; list: string },
): T {
  const first = matches[0];
  if (first === undefined) {
    throw new DaemonError(`no ${of.noun} matches "${idOrPrefix}"`, {
      code: `${of.noun}-not-found`,
      hint: `Ids are ten characters and three are enough to pick one. Run \`${of.list}\` to see them.`,
    });
  }
  if (matches.length > 1) {
    throw new DaemonError(`"${idOrPrefix}" matches ${matches.length} ${of.noun}s`, {
      code: "ambiguous-id",
      hint: `Type more of the id: ${matches.map((row) => row.id).join(", ")}`,
    });
  }
  return first;
}
