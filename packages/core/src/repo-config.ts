import { z } from "zod";
import { agPaths } from "./ag-layout.js";
import { IdSchema } from "./id.js";
import { ProfileIdSchema } from "./profile.js";
import { readYamlFile, writeYamlFile } from "./yaml-file.js";

const HEADER = "test and lint commands for this repo, and the profile agn starts tasks with";

// The file is snake_case (it is hand-edited yaml); the type is camelCase like the rest of core.
export const RepoConfigSchema = z
  .strictObject({
    id: IdSchema,
    test_command: z.string().min(1).optional(),
    lint_command: z.string().min(1).optional(),
    default_profile: ProfileIdSchema.optional(),
  })
  .transform((file) => ({
    id: file.id,
    testCommand: file.test_command ?? null,
    lintCommand: file.lint_command ?? null,
    defaultProfileId: file.default_profile ?? null,
  }));
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export function defaultRepoConfig(id: string): RepoConfig {
  return { id, testCommand: null, lintCommand: null, defaultProfileId: null };
}

/** Null when the repo has no `agnostic.yaml`: `agn add` registers a repo without writing one. */
export function readRepoConfig(repoPath: string): Promise<RepoConfig | null> {
  const file = agPaths(repoPath).agnosticYaml;
  return readYamlFile(
    file,
    RepoConfigSchema,
    `Fix ${file} or run \`agn init --force\` to rewrite it.`,
  );
}

export function writeRepoConfig(repoPath: string, config: RepoConfig): Promise<void> {
  const value: Record<string, unknown> = { id: config.id };
  if (config.testCommand !== null) {
    value.test_command = config.testCommand;
  }
  if (config.lintCommand !== null) {
    value.lint_command = config.lintCommand;
  }
  if (config.defaultProfileId !== null) {
    value.default_profile = config.defaultProfileId;
  }
  return writeYamlFile(agPaths(repoPath).agnosticYaml, value, HEADER);
}
