import { join } from "node:path";

export type AgPaths = {
  dir: string;
  agnosticYaml: string;
  preferencesYaml: string;
  instructionsMd: string;
  decisionsMd: string;
  mcpYaml: string;
  tasksDir: string;
  workflowsDir: string;
};

/** The committed folder is always `.ag/` at the repo root; nothing here is configurable. */
export function agPaths(repoPath: string): AgPaths {
  const dir = join(repoPath, ".ag");
  return {
    dir,
    agnosticYaml: join(dir, "agnostic.yaml"),
    preferencesYaml: join(dir, "preferences.yaml"),
    instructionsMd: join(dir, "instructions.md"),
    decisionsMd: join(dir, "decisions.md"),
    mcpYaml: join(dir, "mcp.yaml"),
    tasksDir: join(dir, "tasks"),
    workflowsDir: join(dir, "workflows"),
  };
}

export function taskNotePath(repoPath: string, taskId: string): string {
  return join(agPaths(repoPath).tasksDir, `${taskId}.md`);
}

/** One workflow, one file: the name in the file and the file's own name have to agree. */
export function workflowPath(repoPath: string, name: string): string {
  return join(agPaths(repoPath).workflowsDir, `${name}.yaml`);
}
