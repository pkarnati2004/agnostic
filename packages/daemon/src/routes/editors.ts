import { stat } from "node:fs/promises";
import {
  type Editor,
  type EditorId,
  type EditorsResponse,
  OpenTaskQuerySchema,
  type OpenTaskResponse,
  type Task,
} from "@agnostic/core";
import { editorCommand } from "@agnostic/registry";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { readDaemonConfig } from "../daemon-config.js";
import { DaemonError, requestInvalid } from "../error.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";

/**
 * The daemon resolves an open - which editor, which directory, which command - and the caller
 * runs it, because the editor belongs in the user's login session and not in the daemon's
 * (ADR 023). Both routes are GETs: they detect and read config, and change nothing.
 */
export function editorRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/editors", async (c) => {
      const editors = await ctx.detectEditors();
      const configured = (await readDaemonConfig(ctx.paths)).editor;
      const fallback = editors[0]?.id ?? null;
      const body: EditorsResponse = {
        editors,
        default: editors.some((editor) => editor.id === configured) ? configured : fallback,
      };
      return c.json(body);
    })
    .get("/tasks/:id/open", async (c) => {
      const query = OpenTaskQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const editor = await chooseEditor(ctx, query.data.editor);
      const dir = await openDir(ctx, task);
      const body: OpenTaskResponse = { task, editor, dir, argv: editorCommand(editor, dir) };
      return c.json(body);
    });
}

/** The request's editor, else the configured one, else the first this machine has. */
async function chooseEditor(ctx: DaemonContext, wanted: EditorId | undefined): Promise<Editor> {
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

/** The worktree of a git task, the directory an adopted session runs in, or the repo itself. */
async function openDir(ctx: DaemonContext, task: Task): Promise<string> {
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

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}
