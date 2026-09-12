import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  agPaths,
  defaultPreferences,
  defaultRepoConfig,
  readTextFile,
  writePreferences,
  writeRepoConfig,
} from "@agnostic/core";
import { AG_FILES, type InitInputs, type InitPlan } from "./init-plan.js";

export async function readInitInputs(repoPath: string, repoId: string): Promise<InitInputs> {
  const paths = agPaths(repoPath);
  return {
    repoId,
    repoName: basename(repoPath),
    hasAgnosticYaml: await exists(paths.agnosticYaml),
    hasPreferences: await exists(paths.preferencesYaml),
    hasInstructions: await exists(paths.instructionsMd),
    hasDecisions: await exists(paths.decisionsMd),
    hasTasksDir: await exists(paths.tasksDir),
    claudeMd: await readTextFile(join(repoPath, "CLAUDE.md")),
    agentsMd: await readTextFile(join(repoPath, "AGENTS.md")),
  };
}

/** Only what the plan calls created or rewritten is touched; a file already there is left alone. */
export async function applyInitPlan(repoPath: string, plan: InitPlan): Promise<void> {
  const paths = agPaths(repoPath);
  await mkdir(paths.dir, { recursive: true });
  for (const write of plan.writes) {
    if (write.action === "kept") {
      continue;
    }
    await writeEntry(repoPath, plan, write.file);
  }
}

async function writeEntry(repoPath: string, plan: InitPlan, file: string): Promise<void> {
  const paths = agPaths(repoPath);
  if (file === AG_FILES.config) {
    await writeRepoConfig(repoPath, defaultRepoConfig(plan.repoId));
    return;
  }
  if (file === AG_FILES.preferences) {
    // ADR 006: the four rules are written out, so they are visible and editable from day one.
    await writePreferences(repoPath, defaultPreferences());
    return;
  }
  if (file === AG_FILES.instructions) {
    // The seed is the user's own text, byte for byte: nothing here trims or reformats it.
    if (plan.instructions !== null) {
      await writeFile(paths.instructionsMd, plan.instructions.text, "utf8");
    }
    return;
  }
  if (file === AG_FILES.decisions) {
    await writeFile(paths.decisionsMd, "", "utf8");
    return;
  }
  await mkdir(paths.tasksDir, { recursive: true });
  await writeFile(join(paths.tasksDir, ".gitkeep"), "", "utf8");
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}
