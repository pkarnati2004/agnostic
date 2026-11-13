import type { AgTextFile } from "./ag-text.js";

/** The repo's own commit prompt, relative to `.ag/`: the name `readAgText` takes. */
export const COMMIT_PROMPT_FILE: AgTextFile = "prompts/commit.md";

/** How many uncommitted paths the ask names before it says how many more there are. */
export const COMMIT_PROMPT_PATHS = 20;

export type CommitPromptInput = { branch: string; file: string | null; paths: string[] };

const HOW =
  "Write the message as one line that says what changed, and add a short body when the reason " +
  "is not obvious from the diff. Do not push. If this repo has its own commit or land command, " +
  "run that instead.";

/**
 * What agn asks for when nobody in the repo has said otherwise. One paragraph, because it is read
 * in a composer, and the last sentence hands the repo its own way of doing this: a repo with a
 * `/land` command says so in `.ag/prompts/commit.md` and that text is sent instead. At launch no
 * path is known; the ask names the paths the Changes panel lists as uncommitted, because an agent
 * refuses to commit "every change this task made" for a file that was there before it started.
 */
export function defaultCommitPrompt(branch: string, paths: string[]): string {
  if (paths.length === 0) {
    return `Commit your work on \`${branch}\`. Stage every change this task made and commit it. ${HOW}`;
  }
  return `Commit the uncommitted changes on \`${branch}\`: ${pathList(paths)}. ${HOW}`;
}

function pathList(paths: string[]): string {
  const named = paths.slice(0, COMMIT_PROMPT_PATHS).map(quoted);
  const rest = paths.length - named.length;
  return rest > 0 ? `${named.join(", ")} and ${rest} more` : named.join(", ");
}

/**
 * The repo's file when it holds any text at all, agn's default otherwise. The file is sent verbatim:
 * agn fills nothing in and parses nothing out, so what the repo wrote is what the agent reads.
 */
export function commitPrompt(input: CommitPromptInput): string {
  const written = input.file?.trim() ?? "";
  return written === "" ? defaultCommitPrompt(input.branch, input.paths) : written;
}

/** A backtick or a newline would break the code span, and a newline would end the typed line. */
function quoted(path: string): string {
  return /[`\n\r]/.test(path) ? JSON.stringify(path) : `\`${path}\``;
}
