import { stat } from "node:fs/promises";
import {
  type ExecutorProvider,
  isProcessAlive,
  type Repo,
  type SessionEvent,
  sessionHandle,
  type Task,
  type TaskStatus,
} from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import type { Logger } from "./log.js";
import { syncTaskNote } from "./task-note-sync.js";

type LifecycleDeps = {
  ledger: Ledger;
  executor: ExecutorProvider;
  log: Logger;
  /**
   * Runs once a task has reached a terminal status and its harness is gone, before the caller is
   * told it has: the test command at close needs the worktree to itself.
   */
  afterClose?: (task: Task) => Promise<void>;
};

export type TaskLifecycle = {
  /** The executor's one event kind, from the tmux pane-died hook or the scan at start. */
  onExited(event: SessionEvent): void;
  stop(task: Task): Promise<Task>;
  reconcile(task: Task): Promise<Task>;
  reconcileAll(): Promise<void>;
  /** Runs once at start; see `failQueued` below for why a queued row there is nobody's. */
  failQueued(): Promise<void>;
};

const LIVE: TaskStatus[] = ["running", "waiting"];
const TERMINAL: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * ADR 014: exit code 0 is done, any other code failed, a signal or a vanished server stopped, and
 * a terminal status never changes again. Liveness is reconciled on demand - at start, before a
 * task is read, and before the folder guard - rather than by a poll (ADR 013).
 */
export function createTaskLifecycle(deps: LifecycleDeps): TaskLifecycle {
  const { ledger, executor, log } = deps;

  // The transition stands whatever this does: an outcome is worth recording, not worth failing over.
  const closed = async (task: Task): Promise<Task> => {
    await deps.afterClose?.(task).catch((cause: unknown) => {
      log.error("outcome not recorded", { taskId: task.id, message: reason(cause) });
    });
    return task;
  };

  const settle = async (task: Task, to: TaskStatus, defer = false): Promise<Task> => {
    if (!LIVE.includes(task.status)) {
      return task;
    }
    const updated = ledger.tasks.setStatus(task.id, to);
    if (!TERMINAL.includes(to)) {
      return updated;
    }
    const repo = ledger.repos.get(task.repoId);
    if (repo !== null) {
      await syncTaskNote(repo.path, updated, log);
    }
    // `stop` defers: the harness is still in the worktree until the executor has killed it.
    return defer ? updated : await closed(updated);
  };

  /** Recorded in the ledger, so a verdict can tell a worktree agn removed from one deleted by hand. */
  const release = async (task: Task, repo: Repo): Promise<void> => {
    if (
      task.worktreePath === null ||
      repo.kind === "folder" ||
      !(await isThere(task.worktreePath))
    ) {
      return;
    }
    await executor.clean({ task, repo, deleteBranch: false });
    ledger.tasks.clean(task.id, false);
  };

  const reconcile = async (task: Task): Promise<Task> => {
    if (!LIVE.includes(task.status)) {
      return task;
    }
    const handle = sessionHandle(task);
    if (handle !== null) {
      // "exited" is a session whose real exit code is still on its way from the watcher; settling
      // it here as stopped would overwrite done or failed with a guess.
      return (await executor.sessionState(handle)) === "gone" ? settle(task, "stopped") : task;
    }
    // A session adopted from outside tmux has no pane to ask about, so the pid is the liveness.
    const pid = task.session?.pid ?? null;
    if (pid === null) {
      return task;
    }
    return isProcessAlive(pid) ? task : settle(task, "stopped");
  };

  return {
    onExited(event) {
      // The executor emits from a file watcher; it has no caller to hand a rejection back to.
      recordExit(ledger, settle, event).catch((cause: unknown) => {
        log.error("exit not recorded", { taskId: event.taskId, message: reason(cause) });
      });
    },

    async stop(task) {
      if (!LIVE.includes(task.status)) {
        return task;
      }
      // Stopped is written first, so the exit event that follows finds a terminal task and no
      // second transition is recorded.
      const stopped = await settle(task, "stopped", true);
      const handle = sessionHandle(task);
      if (handle !== null) {
        await executor.stop(handle);
      }
      return await closed(stopped);
    },

    reconcile,

    /**
     * A queued row exists only inside the call that is launching it, so one found at start belongs
     * to a daemon that died mid-launch: nothing will ever start it, and the worktree it reserved
     * is nobody's. The branch stays, the way `agn clean` leaves it.
     *
     * The ledger is per AGNOSTIC_HOME, so the sweep can only ever see this daemon's queued rows,
     * never a sibling's. The worktree is removed with force because no agent ever ran in it: the
     * setup command's output is the only thing lost, and running the command again reproduces it.
     */
    async failQueued() {
      for (const task of ledger.tasks.list({ status: ["queued"] })) {
        log.warn("queued task failed: the daemon launching it did not finish", { taskId: task.id });
        const failed = ledger.tasks.setStatus(task.id, "failed");
        const repo = ledger.repos.get(task.repoId);
        if (repo === null) {
          continue;
        }
        await syncTaskNote(repo.path, failed, log);
        await release(failed, repo).catch((cause: unknown) => {
          log.error("worktree not removed", { taskId: task.id, message: reason(cause) });
        });
      }
    },

    async reconcileAll() {
      for (const task of ledger.tasks.list({ status: LIVE })) {
        await reconcile(task).catch((cause: unknown) => {
          log.error("liveness not checked", { taskId: task.id, message: reason(cause) });
        });
      }
    },
  };
}

async function recordExit(
  ledger: Ledger,
  settle: (task: Task, to: TaskStatus) => Promise<Task>,
  event: SessionEvent,
): Promise<void> {
  const task = ledger.tasks.get(event.taskId);
  // The session name carries the task id, so a file left by some other tool is not ours to read.
  if (task === null || task.session?.tmuxSession !== event.tmuxSession) {
    return;
  }
  // A resume takes the session name back, so an exit from the launch before it is not this one's.
  if (event.launchId !== null && task.session.launchId !== event.launchId) {
    return;
  }
  await settle(task, statusFor(event.exitCode));
}

function statusFor(exitCode: number | null): TaskStatus {
  if (exitCode === null) {
    return "stopped";
  }
  return exitCode === 0 ? "done" : "failed";
}

function isThere(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
