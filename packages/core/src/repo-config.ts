import { z } from "zod";
import { agPaths } from "./ag-layout.js";
import { IdSchema } from "./id.js";
import { ProfileIdSchema } from "./profile.js";
import { readYamlFile, writeYamlFile } from "./yaml-file.js";

const HEADER =
  "test and lint commands for this repo, the profile agn starts tasks with, and how worktrees are made";

/** Where a design task's files go, relative to the worktree, when the repo names no other folder. */
export const DEFAULT_DESIGN_FOLDER = "design";

// A relative path inside the worktree: no leading or trailing separator, and nothing that climbs
// out of it. The worktree is agn's to create folders in; the rest of the disk is not.
const DesignFolderSchema = z
  .string()
  .regex(/^[^/\\][^\0]*[^/\\]$|^[^/\\]$/)
  .refine((value) => !value.split(/[/\\]/).includes(".."), {
    error: "expected a folder inside the worktree, with no .. segment",
  });

// The file is snake_case (it is hand-edited yaml); the type is camelCase like the rest of core.
export const RepoConfigSchema = z
  .strictObject({
    id: IdSchema,
    test_command: z.string().min(1).optional(),
    lint_command: z.string().min(1).optional(),
    default_profile: ProfileIdSchema.optional(),
    base_branch: z.string().min(1).optional(),
    branch_prefix: z.string().min(1).optional(),
    setup_command: z.string().min(1).optional(),
    clean_after_merge: z.boolean().optional(),
    design_folder: DesignFolderSchema.optional(),
  })
  .transform((file) => ({
    id: file.id,
    testCommand: file.test_command ?? null,
    lintCommand: file.lint_command ?? null,
    defaultProfileId: file.default_profile ?? null,
    baseBranch: file.base_branch ?? null,
    branchPrefix: file.branch_prefix ?? null,
    setupCommand: file.setup_command ?? null,
    cleanAfterMerge: file.clean_after_merge ?? false,
    designFolder: file.design_folder ?? DEFAULT_DESIGN_FOLDER,
  }));
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export function defaultRepoConfig(id: string): RepoConfig {
  return {
    id,
    testCommand: null,
    lintCommand: null,
    defaultProfileId: null,
    baseBranch: null,
    branchPrefix: null,
    setupCommand: null,
    cleanAfterMerge: false,
    designFolder: DEFAULT_DESIGN_FOLDER,
  };
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
  if (config.baseBranch !== null) {
    value.base_branch = config.baseBranch;
  }
  if (config.branchPrefix !== null) {
    value.branch_prefix = config.branchPrefix;
  }
  if (config.setupCommand !== null) {
    value.setup_command = config.setupCommand;
  }
  if (config.cleanAfterMerge) {
    value.clean_after_merge = true;
  }
  // The default is not written back: a rewrite adds no key the user never wrote.
  if (config.designFolder !== DEFAULT_DESIGN_FOLDER) {
    value.design_folder = config.designFolder;
  }
  return writeYamlFile(agPaths(repoPath).agnosticYaml, value, HEADER);
}
