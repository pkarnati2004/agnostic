import {
  RegisterRepoRequestSchema,
  type RegisterRepoResponse,
  type Repo,
  RepoListQuerySchema,
  type RepoListResponse,
  type RepoListRow,
  type RepoResponse,
  readRepoConfig,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { DaemonError, requestInvalid } from "../error.js";
import { registerRepo } from "../register-repo.js";
import { resolveRepoId } from "../resolve-id.js";

export function repoRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/repos", async (c) => {
      const query = RepoListQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const filter = query.data.all ? {} : { status: "active" as const };
      // One read transaction, cursor first (ADR 030); reading each repo's config is not part of it.
      const snapshot = ctx.ledger.transaction(() => {
        const cursor = ctx.ledger.events.latestId();
        return { repos: ctx.ledger.repos.list(filter), cursor };
      });
      const body: RepoListResponse = {
        repos: await Promise.all(snapshot.repos.map(row)),
        cursor: snapshot.cursor,
      };
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
    })
    .post("/repos/:id/close", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      // A session that died without a hook must not hold a repo open, so reconcile before looking.
      await ctx.lifecycle.reconcileAll();
      const body: RepoResponse = ctx.ledger.transaction(() => {
        refuseWhileBusy(ctx, repo);
        return { repo: ctx.ledger.repos.update(repo.id, { status: "archived" }) };
      });
      return c.json(body);
    })
    .post("/repos/:id/open", (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const body: RepoResponse = { repo: ctx.ledger.repos.update(repo.id, { status: "active" }) };
      return c.json(body);
    });
}

/** Closing hides a repo, so a live task in it would be hidden too: the user stops it first. */
function refuseWhileBusy(ctx: DaemonContext, repo: Repo): void {
  const busy = ctx.ledger.tasks.list({ repoId: repo.id, status: ["running", "waiting"] })[0];
  if (busy === undefined) {
    return;
  }
  throw new DaemonError(`repo ${repo.name} has a task that is still ${busy.status}`, {
    code: "repo-busy",
    hint: `Run \`agn stop ${busy.id}\` first.`,
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
