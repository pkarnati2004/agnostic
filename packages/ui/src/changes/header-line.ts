import type { ChangesResponse } from "@agnostic/core";

/** The header's four figures, each already worded: the panel places them, it does not count. */
export type HeaderLine = {
  branch: string;
  base: string;
  commits: string;
  uncommitted: string;
  /** Null when the base has not moved, which is when the panel says nothing about it. */
  behind: string | null;
};

export function headerLine(response: ChangesResponse): HeaderLine {
  const behind = response.behind ?? 0;
  return {
    branch: response.task.branch ?? "no branch",
    base: response.base.ref,
    commits: `${response.ahead} ${response.ahead === 1 ? "commit" : "commits"}`,
    uncommitted: `${response.uncommitted} uncommitted`,
    behind: behind > 0 ? `behind ${behind}` : null,
  };
}

/** An adopted task has no base commit of agn's, so its header names the ref it is read against. */
export function adoptedLine(response: ChangesResponse): string {
  return `adopted: changes against \`${response.base.ref}\``;
}
