import { agPaths } from "./ag-layout.js";
import { readTextFile } from "./read-text-file.js";

export type AgTextFile = "instructions.md" | "decisions.md" | "prompts/commit.md";

/** The text files are handed to agents verbatim, so nothing here trims or rewrites them. */
export function readAgText(repoPath: string, file: AgTextFile): Promise<string | null> {
  const paths = agPaths(repoPath);
  const named: Record<AgTextFile, string> = {
    "instructions.md": paths.instructionsMd,
    "decisions.md": paths.decisionsMd,
    "prompts/commit.md": paths.commitPromptMd,
  };
  return readTextFile(named[file]);
}
