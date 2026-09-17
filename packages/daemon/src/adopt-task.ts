import { realpath } from "node:fs/promises";
import { basename, isAbsolute, relative } from "node:path";
import {
  type AdoptRequest,
  type DetectedHarness,
  newId,
  type ProcessMatcher,
  type Repo,
  run,
  type Task,
  writeTaskNote,
} from "@agnostic/core";
import { harnesses, isHeadlessInvocation } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { ensureHooks } from "./hooks-install.js";
import { initialTaskNote } from "./initial-task-note.js";
import { assertRepoOpen } from "./repo-open-guard.js";

const LIVE: Task["status"][] = ["running", "waiting"];

/**
 * The harness processes a person started themselves under `path`. Headless one-shots are dropped:
 * adopting one would register a task that is already over. So are processes agn already tracks -
 * and when they were all there was, that is the answer, not an empty list.
 */
export async function listSessions(
  ctx: DaemonContext,
  repo: Repo,
  path: string,
): Promise<DetectedHarness[]> {
  const root = await resolved(repo.path);
  const under = await resolved(await existing(path));
  if (!(under === root || isUnder(root, under))) {
    throw new DaemonError(`${path} is not inside ${repo.name}`, {
      code: "path-outside-repo",
      hint: `Pass a path under ${repo.path}, or --repo for the repo it belongs to.`,
    });
  }
  const found = await ctx.executor.detect(under, matchers());
  const watched = watchedPids(ctx);
  const sessions = found.filter(
    (session) => !watched.has(session.pid) && !isHeadlessInvocation(session.harness, session.args),
  );
  if (sessions.length === 0) {
    // "nothing is running here" and "what is running here is already yours" are different
    // answers, and a retry after a lost response only ever gets the second.
    for (const session of found) {
      assertUnwatched(ctx, session.pid);
    }
    await assertNoTaskUnder(ctx, under);
  }
  return sessions;
}

/**
 * ARCHITECTURE §4: worktree isolation is never applied retroactively, so an adopted task has no
 * worktree and takes the branch the session is already sitting on. The row and the event that
 * explains it are written together (ADR 007).
 */
export async function adoptTask(ctx: DaemonContext, repo: Repo, req: AdoptRequest): Promise<Task> {
  assertRepoOpen(repo);
  const sessions = await listSessions(ctx, repo, req.path);
  const session = sessions.find((candidate) => candidate.pid === req.pid);
  if (session === undefined) {
    assertUnwatched(ctx, req.pid);
    throw new DaemonError(`no coding agent with pid ${req.pid} is running under ${req.path}`, {
      code: "adopt-pid-not-found",
      hint: "Run `agn adopt <path>` with no --pid to see what agn can see.",
    });
  }
  const branch = repo.kind === "git" ? await currentBranch(session.cwd) : null;
  const now = new Date().toISOString();
  const task = ctx.ledger.transaction(() => {
    // Re-read inside the transaction, so two adopts of the same pid cannot both insert a task.
    assertUnwatched(ctx, session.pid);
    const inserted = ctx.ledger.tasks.insert({
      id: newId(),
      repoId: repo.id,
      title: req.title ?? `adopted ${session.harness} session in ${basename(session.cwd)}`,
      prompt: "",
      profileId: `${session.harness}:default:native`,
      worktreePath: null,
      branch,
      status: "running",
      origin: "adopted",
      baseCommit: null,
      createdAt: now,
      updatedAt: now,
    });
    ctx.ledger.events.append({
      ts: now,
      taskId: inserted.id,
      repoId: repo.id,
      kind: "task.adopted",
      payload: { pid: session.pid, cwd: session.cwd },
    });
    return ctx.ledger.tasks.setSession(inserted.id, {
      harness: session.harness,
      // Chunk 9's hooks report a session id; a session agn did not start has told it nothing yet.
      sessionId: null,
      tmuxSession: session.tmux?.session ?? null,
      tmuxSocket: session.tmux?.socket ?? null,
      // agn did not launch this one, so it belongs to no launch of agn's.
      launchId: null,
      pid: session.pid,
      cwd: session.cwd,
      lastSeenAt: now,
    });
  });
  // There is no launch to carry the task id, so the hook this session fires next is matched by the
  // directory it runs in. The harness reads the config it was started with plus this one.
  await ensureHooks(ctx, session.harness, session.cwd);
  // The row and its event are already written: a note that cannot be written is a line in the log,
  // not a failed adopt.
  await writeTaskNote(repo.path, initialTaskNote(task, "adopted from running session")).catch(
    (cause: unknown) => {
      ctx.log.error("task note not written", {
        taskId: task.id,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    },
  );
  return task;
}

/** A detached HEAD has no branch name to record, and git says so by printing "HEAD". */
async function currentBranch(cwd: string): Promise<string | null> {
  const result = await run("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
    timeoutMs: 5_000,
  }).catch(() => null);
  const branch = result?.stdout.trim();
  return branch === undefined || branch === "" || branch === "HEAD" ? null : branch;
}

function matchers(): ProcessMatcher[] {
  return harnesses.map((def) => ({ harness: def.id, processNames: def.processNames }));
}

/** A process agn is already watching is not a candidate: adopting it would be a second task. */
function watchedPids(ctx: DaemonContext): Map<number, string> {
  const pids = new Map<number, string>();
  for (const task of ctx.ledger.tasks.list({ status: LIVE })) {
    const pid = task.session?.pid;
    if (pid !== undefined && pid !== null) {
      pids.set(pid, task.id);
    }
  }
  return pids;
}

/**
 * The scan is not the only thing that knows: a process it missed - `ps` and `lsof` disagreeing for
 * a moment, a session moved since it was adopted - is still a task in the ledger, and the ledger's
 * answer is better than reporting an empty directory.
 */
async function assertNoTaskUnder(ctx: DaemonContext, under: string): Promise<void> {
  for (const task of ctx.ledger.tasks.list({ status: LIVE })) {
    const cwd = task.session?.cwd;
    if (cwd === undefined) {
      continue;
    }
    const real = await resolved(cwd);
    if (real === under || isUnder(under, real)) {
      throw new DaemonError(`task ${task.id} is already running under ${cwd}`, {
        code: "adopt-already-adopted",
        hint: `Run \`agn status ${task.id}\` to see it.`,
      });
    }
  }
}

/** A pid agn is already watching belongs to a task; adopting it again would be a second one. */
function assertUnwatched(ctx: DaemonContext, pid: number): void {
  const owner = watchedPids(ctx).get(pid);
  if (owner === undefined) {
    return;
  }
  throw new DaemonError(`pid ${pid} is already the session of task ${owner}`, {
    code: "adopt-already-adopted",
    hint: `Run \`agn status ${owner}\` to see it.`,
  });
}

async function existing(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (cause) {
    throw new DaemonError(`${path} does not exist`, {
      code: "path-not-found",
      hint: "Pass the directory the agent is running in.",
      cause,
    });
  }
}

function isUnder(root: string, path: string): boolean {
  const inside = relative(root, path);
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
}

function resolved(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}
