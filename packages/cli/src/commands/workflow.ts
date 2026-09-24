import { mkdir, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import {
  agPaths,
  isDirectory,
  readWorkflow,
  readWorkflows,
  WORKFLOW_NAME,
  type Workflow,
  type WorkflowRole,
  workflowPath,
} from "@agnostic/core";
import { Command, Option } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { renderFields } from "../fields.js";
import { resolveRepoPath } from "../resolve-repo.js";
import { type Column, renderTable } from "../table.js";
import { TEMPLATE_IDS, type TemplateId, workflowTemplate } from "./workflow-templates.js";

type InitFlags = { template?: string; name?: string; force?: boolean; repo?: string };
type RepoFlag = { repo?: string };

const REPO_FLAG = "repo id, prefix or path; defaults to the one you are in";
const INDENT = "  ";
const UNPINNED = "agn picks at sync";

/**
 * A workflow names the roles a repo's pipeline runs, in order, with a task class each. The file is
 * the user's to edit; `agn sync` is what turns it into an agent's own subagent files.
 */
export function workflowCommand(ctx: CliContext): Command {
  const workflow = new Command("workflow").description(
    "declare the roles a repo's pipeline runs, in .ag/workflows/",
  );
  const init = workflow
    .command("init")
    .description("write .ag/workflows/<name>.yaml from a template")
    .option("--name <name>", "the workflow's name and file name; defaults to the template id")
    .option("--force", "overwrite a workflow file that is already there")
    .option("--repo <repo>", REPO_FLAG)
    .action((flags: InitFlags) => initWorkflow(ctx, flags));
  init.addOption(
    new Option("--template <template>", "which template to write")
      .choices(TEMPLATE_IDS)
      .default("tiered"),
  );
  workflow
    .command("list")
    .description("the workflows this repo declares")
    .option("--repo <repo>", REPO_FLAG)
    .action((flags: RepoFlag) => listWorkflows(ctx, flags));
  workflow
    .command("show")
    .argument("<name>", "the workflow's name")
    .description("one workflow's roles, classes, pins and instructions")
    .option("--repo <repo>", REPO_FLAG)
    .action((name: string, flags: RepoFlag) => showWorkflow(ctx, name, flags));
  return workflow;
}

async function initWorkflow(ctx: CliContext, flags: InitFlags): Promise<void> {
  const { path } = await resolveRepoPath(ctx, flags.repo);
  if (!(await isDirectory(agPaths(path).dir))) {
    throw new CliError(`${path} has no .ag/ folder`, {
      code: "ag-missing",
      hint: "Run `agn init` first.",
    });
  }
  const template = templateId(flags.template);
  if (template === "none") {
    ctx.io.out("nothing written: a repo without .ag/workflows/ runs tasks as before");
    return;
  }
  const name = workflowName(flags.name ?? template);
  const file = workflowPath(path, name);
  await makeWorkflowsDir(path, agPaths(path).workflowsDir);
  await writeTemplate(path, file, workflowTemplate(template, name), flags.force === true);
  // Read the file back, so a template that does not parse fails here and not at the first sync.
  const workflow = await readWorkflow(path, name);
  if (workflow === null) {
    throw new CliError(`${relative(path, file)} disappeared while agn was writing it`, {
      code: "workflow-write-lost",
      hint: "Run the command again.",
    });
  }
  if (ctx.json) {
    writeJson(ctx.io, workflow);
    return;
  }
  ctx.io.out(`wrote ${relative(path, file)}`);
  ctx.io.out(`roles: ${pipeline(workflow)}`);
}

async function listWorkflows(ctx: CliContext, flags: RepoFlag): Promise<void> {
  const { path } = await resolveRepoPath(ctx, flags.repo);
  const workflows = await readWorkflows(path);
  if (ctx.json) {
    writeJson(ctx.io, { workflows });
    return;
  }
  if (workflows.length === 0) {
    ctx.io.out("no workflows; run agn workflow init");
    return;
  }
  for (const line of renderTable(workflows, COLUMNS)) {
    ctx.io.out(line);
  }
}

async function showWorkflow(ctx: CliContext, name: string, flags: RepoFlag): Promise<void> {
  const { path } = await resolveRepoPath(ctx, flags.repo);
  const workflow = await readWorkflow(path, workflowName(name));
  if (workflow === null) {
    throw new CliError(`no workflow named ${name}`, {
      code: "workflow-not-found",
      hint: "Run `agn workflow list`.",
    });
  }
  if (ctx.json) {
    writeJson(ctx.io, workflow);
    return;
  }
  const fields: [string, string][] = [
    ["name", workflow.name],
    ["description", workflow.description ?? "-"],
    ["file", relative(path, workflowPath(path, workflow.name))],
  ];
  for (const line of renderFields(fields)) {
    ctx.io.out(line);
  }
  for (const line of workflow.roles.flatMap(roleBlock)) {
    ctx.io.out(line);
  }
}

const COLUMNS: Column<Workflow>[] = [
  { header: "name", value: (workflow) => workflow.name },
  { header: "roles", value: pipelineNames },
  { header: "description", value: (workflow) => workflow.description ?? "-" },
];

/** A blank line opens each role, so four roles with block instructions stay four blocks. */
function roleBlock(role: WorkflowRole, index: number): string[] {
  return [
    "",
    `${index + 1}. ${role.name}  ${role.class}  ${role.profile ?? UNPINNED}`,
    ...indented(role.instructions ?? "-"),
  ];
}

function indented(instructions: string): string[] {
  return instructions
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => (line === "" ? "" : `${INDENT}${line}`));
}

function pipeline(workflow: Workflow): string {
  return workflow.roles.map((role) => `${role.name} (${role.class})`).join(" > ");
}

function pipelineNames(workflow: Workflow): string {
  return workflow.roles.map((role) => role.name).join(" > ");
}

/** Commander has already refused anything else, so this narrows rather than validates. */
function templateId(value: string | undefined): TemplateId {
  return TEMPLATE_IDS.find((id) => id === value) ?? "tiered";
}

/** `--name` becomes a file name and a `/<name>` command, so it is checked before anything is written. */
function workflowName(name: string): string {
  if (!WORKFLOW_NAME.test(name)) {
    throw new CliError(`"${name}" is not a workflow name`, {
      code: "workflow-name-invalid",
      hint: "Use lowercase letters, digits and dashes, starting with a letter.",
    });
  }
  return name;
}

async function writeTemplate(
  repoPath: string,
  file: string,
  text: string,
  force: boolean,
): Promise<void> {
  if (force) {
    await writeFile(file, text, "utf8").catch((cause: unknown) => {
      throw writeRefused(repoPath, file, cause);
    });
    return;
  }
  try {
    // "wx" so two `agn workflow init` runs cannot race one over the other's file.
    await writeFile(file, text, { flag: "wx" });
  } catch (cause) {
    if (errorCode(cause) !== "EEXIST") {
      throw writeRefused(repoPath, file, cause);
    }
    throw new CliError(`${relative(repoPath, file)} exists`, {
      code: "workflow-exists",
      hint: "Pass --force to overwrite it, or --name <other> to add a second workflow.",
    });
  }
}

/** A file called `workflows` is the user's to move; mkdir's own EEXIST says nothing about that. */
async function makeWorkflowsDir(repoPath: string, dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (cause) {
    const code = errorCode(cause);
    if (code !== "EEXIST" && code !== "ENOTDIR") {
      throw writeRefused(repoPath, dir, cause);
    }
    throw new CliError(`${relative(repoPath, dir)} is a file, not a folder`, {
      code: "workflow-dir-not-directory",
      hint: `Move or delete ${dir}, then run the command again.`,
      cause,
    });
  }
}

/** The filesystem refused: a permission, a read-only mount. The path is what the user can act on. */
function writeRefused(repoPath: string, file: string, cause: unknown): CliError {
  return new CliError(`agn could not write ${relative(repoPath, file)}`, {
    code: "workflow-write-refused",
    hint: `Check the permissions on ${file}.`,
    cause,
  });
}

function errorCode(cause: unknown): string | null {
  return cause instanceof Error && "code" in cause ? String(cause.code) : null;
}
