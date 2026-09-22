import {
  type EditorsResponse,
  type OpenedTaskResponse,
  OpenTaskQuerySchema,
  type OpenTaskResponse,
} from "@agnostic/core";
import { editorCommand } from "@agnostic/registry";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { readDaemonConfig } from "../daemon-config.js";
import { requestInvalid } from "../error.js";
import { chooseEditor, openDir, openInEditor } from "../open-editor.js";
import { requestBody } from "../request-body.js";
import { resolveTaskId } from "../resolve-id.js";

/**
 * The GET resolves an open - which editor, which directory, which command - and the caller runs
 * it, because a terminal's editor belongs in the user's login session (ADR 023). The POST is for
 * the page, which has no terminal: there the daemon runs the command itself (ADR 036 Q4).
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
    })
    .post("/tasks/:id/open", async (c) => {
      const parsed = OpenTaskQuerySchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const body: OpenedTaskResponse = await openInEditor(ctx, task, parsed.data.editor);
      return c.json(body);
    });
}
