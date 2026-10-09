import {
  type Editor,
  type EditorId,
  errorMessage,
  isDirectory,
  launchDetached,
  type OpenedTaskResponse,
  spawn,
  type Task,
  taskLogPath,
} from "@agnostic/core";
import { editorCommand } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";
import { resolveRepoId } from "./resolve-id.js";

/**
 * The daemon starts the editor itself, for the page, which has no shell to run a command in
 * (ADR 036 Q4). A daemon with no window server - one started over ssh - cannot, and says so with
 * the command the user can run where they are sitting.
 */
export async function openInEditor(
  ctx: DaemonContext,
  task: Task,
  wanted: EditorId | undefined,
): Promise<OpenedTaskResponse> {
  const editor = await chooseEditor(ctx, wanted);
  const dir = await openDir(ctx, task);
  const argv = editorCommand(editor, dir);
  try {
    if (argv.length === 0) {
      throw new Error("agn knows no command for this editor");
    }
    await launchDetached(spawn, argv, {
      env: ctx.env,
      logFile: taskLogPath(ctx.paths, task.id),
    });
  } catch (cause) {
    throw new DaemonError(`${editor.name} could not open ${dir}: ${errorMessage(cause)}`, {
      code: "editor-failed",
      hint: `Run \`agn open ${task.id}\` from a terminal on this machine.`,
      cause,
    });
  }
  return { editor, dir };
}

/** The request's editor, else the configured one, else the first this machine has. */
export async function chooseEditor(
  ctx: DaemonContext,
  wanted: EditorId | undefined,
): Promise<Editor> {
  const editors = await ctx.detectEditors();
  const first = editors[0];
  if (first === undefined) {
    throw new DaemonError("no editor was found on this machine", {
      code: "editor-none",
      hint: `Install VS Code, Cursor or Zed, or set \`editor\` in ${ctx.paths.config}.`,
    });
  }
  if (wanted !== undefined) {
    return pick(editors, wanted, "Pass --editor with one of the editors agn found");
  }
  const configured = (await readDaemonConfig(ctx.paths)).editor;
  if (configured === null) {
    return first;
  }
  return pick(editors, configured, `Set \`editor\` in ${ctx.paths.config} to one agn found`);
}

/** The worktree of a git task, the directory an adopted session runs in, or the repo itself. */
export async function openDir(ctx: DaemonContext, task: Task): Promise<string> {
  const dir = task.worktreePath ?? task.session?.cwd ?? resolveRepoId(ctx.ledger, task.repoId).path;
  if (await isDirectory(dir)) {
    return dir;
  }
  // Chunk 8's code: the directory is gone, and for a git task the branch it held is not.
  throw new DaemonError(
    task.worktreePath === null
      ? `${dir} no longer exists`
      : `the worktree for task ${task.id} has been cleaned`,
    {
      code: "worktree-cleaned",
      hint:
        task.worktreePath === null
          ? "The directory this task ran in is gone; start a new task in the repo."
          : `Run \`agn run "<prompt>" --base ${task.id}\` to continue from its branch.`,
    },
  );
}

function pick(editors: Editor[], wanted: EditorId, advice: string): Editor {
  const found = editors.find((editor) => editor.id === wanted);
  if (found !== undefined) {
    return found;
  }
  throw new DaemonError(`${wanted} is not installed on this machine`, {
    code: "editor-not-found",
    hint: `${advice}: ${editors.map((editor) => editor.id).join(", ")}.`,
  });
}
