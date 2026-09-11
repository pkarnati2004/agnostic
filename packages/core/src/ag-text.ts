import { agPaths } from "./ag-layout.js";
import { readTextFile } from "./read-text-file.js";

export type AgTextFile = "instructions.md" | "decisions.md";

/** The text files are handed to agents verbatim, so nothing here trims or rewrites them. */
export function readAgText(repoPath: string, file: AgTextFile): Promise<string | null> {
  const paths = agPaths(repoPath);
  return readTextFile(file === "instructions.md" ? paths.instructionsMd : paths.decisionsMd);
}
