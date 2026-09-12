import { realpath } from "node:fs/promises";
import {
  type HarnessId,
  HarnessIdSchema,
  type HookResponse,
  type HookStatus,
  type Task,
  type TaskStatus,
} from "@agnostic/core";
import { hookParser, type ParsedHook } from "@agnostic/hooks";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { syncTaskNote } from "./task-note-sync.js";

/** Only a task that is live can be moved by a hook: queued has not launched, terminal is decided. */
const LIVE: TaskStatus[] = ["running", "waiting"];

/**
 * One hook payload, from the harness that sent it to the row it changes. The harness knows its own
 * session and its own directory; agn knows which task those belong to, and that is all it decides
 * here - the event's meaning was settled by the parser.
 */
export async function receiveHook(
  ctx: DaemonContext,
  harness: string,
  taskHeader: string,
  payload: unknown,
): Promise<HookResponse> {
  const id = HarnessIdSchema.safeParse(harness);
  const parser = id.success ? hookParser(id.data) : null;
  if (!id.success || parser === null) {
    throw new DaemonError(`${harness} has no status hook agn understands`, {
      code: "hook-unsupported",
      hint: "Run `agn doctor` to see which harnesses report status.",
    });
  }
  const parsed = parser.parse(payload);
  const task = await resolveTask(ctx, id.data, taskHeader, parsed);
  const withSession = captureSession(ctx, task, parsed);
  return applyStatus(ctx, withSession, parsed, harness);
}

/**
 * The task id rides in a header for every session agn launched. An adopted session has no such
 * env, so it is found by the session id the harness reports, and failing that by its directory.
 */
async function resolveTask(
  ctx: DaemonContext,
  harness: HarnessId,
  taskHeader: string,
  parsed: ParsedHook,
): Promise<Task> {
  if (taskHeader !== "") {
    const task = ctx.ledger.tasks.get(taskHeader);
    if (task === null) {
      throw new DaemonError(`no task ${taskHeader}`, {
        code: "task-not-found",
        hint: "The hook names a task this ledger has never held.",
      });
    }
    // The header is a shortcut to the lookup below, not a way around it: a task running another
    // harness is not this hook's to move, whoever sent it.
    if (task.session?.harness !== harness) {
      throw noMatch(harness, parsed);
    }
    return task;
  }
  const live = ctx.ledger.tasks
    .list({ status: LIVE })
    .filter((task) => task.session?.harness === harness);
  const bySession =
    parsed.sessionId === null
      ? undefined
      : live.find((task) => task.session?.sessionId === parsed.sessionId);
  const found = bySession ?? (await byDirectory(live, parsed.cwd));
  if (found === undefined) {
    throw noMatch(harness, parsed);
  }
  return found;
}

function noMatch(harness: HarnessId, parsed: ParsedHook): DaemonError {
  return new DaemonError(`no live ${harness} task matches that hook`, {
    code: "hook-task-unknown",
    hint: `Run \`agn adopt ${parsed.cwd ?? "<directory>"}\` to put that session under agn.`,
  });
}

/** Symlinked temp directories mean the harness's cwd and the task's can be the same path spelled
 * two ways, so both are resolved before they are compared. */
async function byDirectory(live: Task[], cwd: string | null): Promise<Task | undefined> {
  if (cwd === null) {
    return undefined;
  }
  const wanted = await realpathOrSelf(cwd);
  for (const task of live) {
    const session = task.session;
    if (session !== undefined && (await realpathOrSelf(session.cwd)) === wanted) {
      return task;
    }
  }
  return undefined;
}

/** The harness's own session id, which is what `agn resume` needs and only a hook reports. */
function captureSession(ctx: DaemonContext, task: Task, parsed: ParsedHook): Task {
  const session = task.session;
  if (
    parsed.sessionId === null ||
    session === undefined ||
    session.sessionId === parsed.sessionId
  ) {
    return task;
  }
  return ctx.ledger.tasks.setSession(task.id, {
    ...session,
    sessionId: parsed.sessionId,
    lastSeenAt: new Date().toISOString(),
  });
}

async function applyStatus(
  ctx: DaemonContext,
  task: Task,
  parsed: ParsedHook,
  harness: string,
): Promise<HookResponse> {
  if (parsed.status === null) {
    // An event agn has no rule for. No payload contents are ever logged: the event name is the
    // whole of what this line says.
    ctx.log.info("hook ignored", { harness, event: parsed.event });
  }
  const to = transition(task, parsed.status);
  if (to === null) {
    return { task, applied: null };
  }
  const updated = ctx.ledger.tasks.setStatus(task.id, to);
  const repo = ctx.ledger.repos.get(updated.repoId);
  if (repo !== null) {
    await syncTaskNote(repo.path, updated, ctx.log);
  }
  return { task: updated, applied: to };
}

function transition(task: Task, status: HookStatus | null): HookStatus | null {
  if (status === null || !LIVE.includes(task.status) || task.status === status) {
    return null;
  }
  return status;
}

async function realpathOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}
