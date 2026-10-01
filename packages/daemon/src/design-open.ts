import { join } from "node:path";
import {
  DEFAULT_DESIGN_FOLDER,
  type DesignOpenedResponse,
  type DesignOpenResponse,
  type DesignTool,
  designToolOf,
  launchDetached,
  readRepoConfig,
  spawn,
  type Task,
  taskLogPath,
} from "@agnostic/core";
import { designToolCommand } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { openDir } from "./open-editor.js";
import { resolveRepoId } from "./resolve-id.js";

/**
 * Where a design task's files are and what opens its tool. The folder is reported and never
 * passed to the tool: neither tool documents taking a directory, and the system opener would
 * hand it a document it cannot read (ADR 036 Q15).
 */
export async function resolveDesignOpen(
  ctx: DaemonContext,
  task: Task,
): Promise<DesignOpenResponse> {
  const tool = await designTool(ctx, task);
  return { task, tool, folder: await designFolder(ctx, task), argv: designToolCommand(tool) };
}

/**
 * The same open, run by the daemon for the page, which has no shell (ADR 023). A daemon with no
 * window server - one reached over ssh - cannot, and says where the command can be run instead.
 */
export async function openDesignTool(
  ctx: DaemonContext,
  task: Task,
): Promise<DesignOpenedResponse> {
  const { tool, folder, argv } = await resolveDesignOpen(ctx, task);
  try {
    await launchDetached(spawn, argv, {
      env: ctx.env,
      logFile: taskLogPath(ctx.paths, task.id),
    });
  } catch (cause) {
    throw new DaemonError(`${tool.name} could not be opened: ${detail(cause)}`, {
      code: "design-tool-failed",
      hint: `Run \`agn open ${task.id} --tool\` from a terminal on this machine.`,
      cause,
    });
  }
  return { tool, folder };
}

/** The tool the task's profile names, as this machine has it now. */
async function designTool(ctx: DaemonContext, task: Task): Promise<DesignTool> {
  const wanted = designToolOf(task.profileId);
  if (wanted === null) {
    throw new DaemonError(`task ${task.id} is not a design task`, {
      code: "not-a-design-task",
      hint: `Run \`agn open ${task.id}\` to open its worktree in your editor.`,
    });
  }
  const tools = await ctx.detectDesignTools();
  const found = tools.find((tool) => tool.id === wanted);
  if (found === undefined) {
    throw new DaemonError(`agn found no way to open ${wanted} on this machine`, {
      code: "design-tool-not-found",
      hint: `Set \`design_tool\` in ${ctx.paths.config} to one of: ${ids(tools)}.`,
    });
  }
  return found;
}

/** The repo's `design_folder`, inside whatever directory the task's work lives in. */
async function designFolder(ctx: DaemonContext, task: Task): Promise<string> {
  const repo = resolveRepoId(ctx.ledger, task.repoId);
  const config = await readRepoConfig(repo.path);
  return join(await openDir(ctx, task), config?.designFolder ?? DEFAULT_DESIGN_FOLDER);
}

function ids(tools: DesignTool[]): string {
  return tools.length === 0 ? "none" : tools.map((tool) => tool.id).join(", ");
}

function detail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
