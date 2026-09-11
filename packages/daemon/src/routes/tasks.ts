import { TaskListQuerySchema, type TaskListResponse, type TaskResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";

export function taskRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/repos/:id/tasks", (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const query = TaskListQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const filter = query.data.status === undefined ? {} : { status: query.data.status };
      const body: TaskListResponse = {
        tasks: ctx.ledger.tasks.list({ repoId: repo.id, ...filter }),
      };
      return c.json(body);
    })
    .get("/tasks/:id", (c) => {
      const body: TaskResponse = { task: resolveTaskId(ctx.ledger, c.req.param("id")) };
      return c.json(body);
    });
}
