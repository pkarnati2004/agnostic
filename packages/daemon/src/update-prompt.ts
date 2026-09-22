import type { UpdateMode } from "@agnostic/core";

export type UpdatePromptInput = {
  baseRef: string;
  branch: string;
  mode: UpdateMode;
  /** The repo's `test_command`, or null: the agent is asked to keep the tests green either way. */
  testCommand: string | null;
};

/**
 * The turn agn types into the agent's session (ADR 036 Q6). One line, because it is read in a
 * composer: what to fetch, what to do with it and why that way, and the rule agn will not break
 * on the agent's behalf. agn runs none of these commands itself.
 */
export function updatePrompt(input: UpdatePromptInput): string {
  const how =
    input.mode === "rebase"
      ? "by rebasing onto it (this branch was never pushed)"
      : "by merging it in (this branch was pushed)";
  const tests =
    input.testCommand === null
      ? "Keep the tests green."
      : `Run \`${input.testCommand}\` and keep it green.`;
  return (
    `Fetch \`${input.baseRef}\`. Bring \`${input.branch}\` up to date with it ${how}. ` +
    `Resolve conflicts. ${tests} Do not push.`
  );
}
