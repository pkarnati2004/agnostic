import type { HarnessId } from "./profile.js";
import type { Repo } from "./repo.js";
import type { Task } from "./task.js";

/** Where the harness will run, and the branch it works on (null for a folder workspace). */
export type Prepared = { cwd: string; branch: string | null };

export type PrepareInput = {
  task: Task;
  repo: Repo;
  /** A ref or commit to branch from; null takes the main checkout's HEAD commit. */
  base: string | null;
  /** Replaces `agn/` in the branch name when the repo asks for it. */
  branchPrefix: string | null;
  setupCommand: string | null;
  /** The task log the setup command's output is appended to; null discards it. */
  logFile: string | null;
};

export type CleanInput = { task: Task; repo: Repo; deleteBranch: boolean };

/** env is the whole child environment: the daemon merges the scrubbed parent env and its own. */
export type LaunchCommand = {
  command: string;
  args: string[];
  env: Record<string, string>;
  promptAfterStart: string | null;
};

export type LaunchRequest = { taskId: string; cwd: string; command: LaunchCommand };

/** Rebuilt from `Task.session` on every call, so a daemon restart loses nothing. */
export type SessionHandle = {
  taskId: string;
  tmuxSession: string;
  /** Null means the user's default tmux server, where adopted sessions live. */
  tmuxSocket: string | null;
  cwd: string;
};

export function sessionHandle(task: Task): SessionHandle | null {
  const session = task.session;
  if (session === undefined) {
    return null;
  }
  return {
    taskId: task.id,
    tmuxSession: session.tmuxSession,
    tmuxSocket: session.tmuxSocket,
    cwd: session.cwd,
  };
}

/** The argv a terminal runs to attach; the caller inherits stdio and unsets TMUX first. */
export type AttachInfo = { kind: "tmux"; argv: string[] };

/** exitCode is null when a signal killed the harness or the tmux server went away. */
export type SessionEvent = {
  kind: "exited";
  taskId: string;
  tmuxSession: string;
  exitCode: number | null;
  at: string;
};

/** The daemon builds these from the registry so the executor never imports it. */
export type ProcessMatcher = { harness: HarnessId; processNames: string[] };

export type DetectedHarness = {
  harness: HarnessId;
  pid: number;
  cwd: string;
  args: string[];
  /** Null means the process is not under tmux, so it was found but cannot be attached to. */
  tmux: { socket: string | null; session: string } | null;
};

export interface ExecutorProvider {
  id: "tmux-local";
  /** Idempotent; never called for adopted tasks. */
  prepare(input: PrepareInput): Promise<Prepared>;
  launch(req: LaunchRequest): Promise<SessionHandle>;
  /** True while the session exists and its pane process is still running. */
  alive(handle: SessionHandle): Promise<boolean>;
  attach(handle: SessionHandle): AttachInfo;
  /** Idempotent; the exited event still fires exactly once. */
  stop(handle: SessionHandle): Promise<void>;
  /** Removes the worktree, keeps the branch unless asked; a no-op for folders. */
  clean(input: CleanInput): Promise<void>;
  detect(path: string, matchers: ProcessMatcher[]): Promise<DetectedHarness[]>;
  onEvent(cb: (e: SessionEvent) => void): () => void;
  /** Stops the watcher; kills no session. */
  close(): Promise<void>;
}
