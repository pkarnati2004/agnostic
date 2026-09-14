import {
  RegisterRepoRequestSchema,
  type RegisterRepoResponse,
  type Repo,
  type RepoListResponse,
  type RepoListRow,
  readRepoConfig,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { registerRepo } from "../register-repo.js";

export function repoRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/repos", async (c) => {
      const body: RepoListResponse = { repos: await Promise.all(ctx.ledger.repos.list().map(row)) };
      return c.json(body);
    })
    .post("/repos", async (c) => {
      // A body that is not JSON at all is the same mistake as a body with the wrong fields.
      const parsed = RegisterRepoRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: RegisterRepoResponse = await registerRepo(ctx.ledger, ctx.paths, parsed.data);
      return c.json(body, body.created ? 201 : 200);
    });
}

/**
 * The CLI never opens a repo's files, so the test command travels with the repo it belongs to. A
 * repo whose config is missing, malformed or no longer on disk still lists, with no command.
 */
async function row(repo: Repo): Promise<RepoListRow> {
  const testCommand = await readRepoConfig(repo.path).then(
    (config) => config?.testCommand ?? null,
    () => null,
  );
  return { ...repo, testCommand };
}
