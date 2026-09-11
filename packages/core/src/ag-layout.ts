import { join } from "node:path";

export type AgPaths = {
  dir: string;
  agnosticYaml: string;
  preferencesYaml: string;
  instructionsMd: string;
  decisionsMd: string;
  tasksDir: string;
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
    tasksDir: join(dir, "tasks"),
  };
}

export function taskNotePath(repoPath: string, taskId: string): string {
  return join(agPaths(repoPath).tasksDir, `${taskId}.md`);
}
