import type { CreatePrResponse } from "@agnostic/core";

/** What the dialog says once the daemon has answered: what happened, and what to do next. */
export type PrOutcome = { line: string; detail: string };

export function prOutcome(response: CreatePrResponse, copied: boolean): PrOutcome {
  const line =
    response.via === "gh"
      ? "Pull request opened."
      : "GitHub's compare page is open; paste the description and create the PR.";
  const detail = copied ? "Description copied to the clipboard." : "Copy the description below.";
  return {
    line,
    detail: response.pushed ? detail : `${detail} The branch was already on origin.`,
  };
}
