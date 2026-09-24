import type { AgTextFile } from "./ag-text.js";

/** The repo's own commit prompt, relative to `.ag/`: the name `readAgText` takes. */
export const COMMIT_PROMPT_FILE: AgTextFile = "prompts/commit.md";

/**
 * What agn asks for when nobody in the repo has said otherwise. One paragraph, because it is read
 * in a composer, and the last sentence hands the repo its own way of doing this: a repo with a
 * `/land` command says so in `.ag/prompts/commit.md` and that text is sent instead.
 */
export function defaultCommitPrompt(branch: string): string {
  return (
    `Commit your work on \`${branch}\`. Stage every change this task made and commit it. ` +
    "Write the message as one line that says what changed, and add a short body when the reason " +
    "is not obvious from the diff. Do not push. If this repo has its own commit or land command, " +
    "run that instead."
  );
}

/**
 * The repo's file when it holds any text at all, agn's default otherwise. The file is sent verbatim:
 * agn fills nothing in and parses nothing out, so what the repo wrote is what the agent reads.
 */
export function commitPrompt(input: { branch: string; file: string | null }): string {
  const written = input.file?.trim() ?? "";
  return written === "" ? defaultCommitPrompt(input.branch) : written;
}
