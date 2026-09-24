import { readdir } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { agPaths, workflowPath } from "./ag-layout.js";
import { ConfigError } from "./error.js";
import { ProfileIdSchema } from "./profile.js";
import { TaskIntentSchema } from "./task-intent.js";
import { readYamlFile } from "./yaml-file.js";

/** A file name and a Claude Code agent or command name at once, so one rule covers both. */
export const WORKFLOW_NAME = /^[a-z][a-z0-9-]{0,63}$/;

const EXTENSION = ".yaml";

export const WorkflowRoleSchema = z
  .strictObject({
    name: z.string().regex(WORKFLOW_NAME),
    class: TaskIntentSchema,
    profile: ProfileIdSchema.optional(),
    instructions: z.string().min(1).optional(),
  })
  .transform((role) => ({
    name: role.name,
    class: role.class,
    // Absent means the recommender picks a profile for the class when the workflow is compiled.
    profile: role.profile ?? null,
    instructions: role.instructions ?? null,
  }));
export type WorkflowRole = z.infer<typeof WorkflowRoleSchema>;

/** The roles are the pipeline, in the order the file writes them. */
export const WorkflowSchema = z
  .strictObject({
    name: z.string().regex(WORKFLOW_NAME),
    description: z.string().min(1).optional(),
    roles: z
      .array(WorkflowRoleSchema)
      .min(1)
      .check((ctx) => {
        const repeated = repeatedRoleName(ctx.value);
        if (repeated !== null) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            message: `role names must be unique: ${repeated} appears twice`,
          });
        }
      }),
  })
  .transform((file) => ({
    name: file.name,
    description: file.description ?? null,
    roles: file.roles,
  }));
export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * Null when the file is not there; a `ConfigError` when it is there and cannot be used, because a
 * workflow the user wrote and misspelled must not quietly become no workflow at all.
 */
export async function readWorkflow(repoPath: string, name: string): Promise<Workflow | null> {
  const file = workflowPath(repoPath, name);
  const workflow = await readYamlFile(file, WorkflowSchema, hint(file, name));
  if (workflow === null) {
    return null;
  }
  if (workflow.name !== name) {
    throw new ConfigError(
      `${file} says name: ${workflow.name}, but the file is ${name}${EXTENSION}`,
      { code: "workflow-name-mismatch", hint: hint(file, name), file },
    );
  }
  return workflow;
}

/** Every `*.yaml` under `.ag/workflows/`, by name; `[]` when the folder is missing. */
export async function readWorkflows(repoPath: string): Promise<Workflow[]> {
  const workflows: Workflow[] = [];
  for (const name of await workflowNames(repoPath)) {
    const workflow = await readWorkflow(repoPath, name);
    if (workflow !== null) {
      workflows.push(workflow);
    }
  }
  return workflows;
}

/** A README or a `.yml` file in the folder is someone's note, not a workflow agn has to parse. */
async function workflowNames(repoPath: string): Promise<string[]> {
  const entries = await readdir(agPaths(repoPath).workflowsDir).catch((cause: unknown) => {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return [];
    }
    throw cause;
  });
  return entries
    .filter((entry) => entry.endsWith(EXTENSION))
    .map((entry) => basename(entry, EXTENSION))
    .sort();
}

/** One name, one role: two roles called the same thing would compile to one agent file. */
function repeatedRoleName(roles: WorkflowRole[]): string | null {
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.name)) {
      return role.name;
    }
    seen.add(role.name);
  }
  return null;
}

function hint(file: string, name: string): string {
  return `Fix ${file}, or run \`agn workflow init --template <single|tiered> --name ${name} --force\` to rewrite it.`;
}
