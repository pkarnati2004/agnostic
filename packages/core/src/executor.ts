import type { HarnessId } from "./profile.js";
import type { Repo } from "./repo.js";
import type { Task } from "./task.js";

/**
 * Where the harness will run, the branch it works on (null for a folder workspace), and the commit
 * that branch started from - the only honest base for "what did the agent change" once the branch
 * has been merged. Null when an existing worktree or branch was reused, which the ledger keeps.
 */
export type Prepared = { cwd: string; branch: string | null; baseCommit: string | null };

export type PrepareInput = {
  task: Task;
  repo: Repo;
  /** A ref or commit to branch from; null takes the main checkout's HEAD commit. */
  base: string | null;
  /** The branch to check out; null derives one from the title. A resume passes the row's own, so a
   * worktree rebuilt after a clean lands on the branch the task ran on (ADR 031). */
  branch: string | null;
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

/**
 * "exited" is a session whose harness has ended but whose exit code has not been read yet, so the
 * caller must wait for the exit event rather than decide the task's fate itself.
 */
export type SessionState = "running" | "exited" | "gone";

/** Rebuilt from `Task.session` on every call, so a daemon restart loses nothing. */
export type SessionHandle = {
  taskId: string;
  tmuxSession: string;
  /** Null means the user's default tmux server, where adopted sessions live. */
  tmuxSocket: string | null;
  /** The launch this handle belongs to: a resume reuses the session name, not this. Null: adopted. */
  launchId: string | null;
  cwd: string;
};

/** Null when the task has no session, or one that is not under tmux: there is nothing to drive. */
export function sessionHandle(task: Task): SessionHandle | null {
  const session = task.session;
  if (session === undefined || session.tmuxSession === null) {
    return null;
  }
  return {
    taskId: task.id,
    tmuxSession: session.tmuxSession,
    tmuxSocket: session.tmuxSocket,
    launchId: session.launchId,
    cwd: session.cwd,
  };
}

/** The argv a terminal runs to attach; the caller inherits stdio and unsets TMUX first. */
export type AttachInfo = { kind: "tmux"; argv: string[] };

export type TerminalSize = { cols: number; rows: number };

/** One tmux client in a pty. Bytes both ways; the tmux server holds the only history. */
export type TerminalStream = {
  write(data: Uint8Array): void;
  /** Sent to the pty; tmux's window-size (default latest) lets the newest client's size win. */
  resize(size: TerminalSize): void;
  onData(cb: (data: Uint8Array) => void): () => void;
  /** Fires once, when the tmux client exits: detach, session killed, or the server gone. */
  onExit(cb: (exitCode: number) => void): () => void;
  /** Ends this client only; the session and the harness go on. Idempotent; onExit still fires. */
  close(): void;
};

/** exitCode is null when a signal killed the harness or the tmux server went away. */
export type SessionEvent = {
  kind: "exited";
  taskId: string;
  tmuxSession: string;
  /** Which launch ended: a session name outlives the run that created it, this does not. */
  launchId: string | null;
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
  /** Running, ended with its exit code still to come, or gone without a trace. */
  sessionState(handle: SessionHandle): Promise<SessionState>;
  attach(handle: SessionHandle): AttachInfo;
  /** Types `text` into the session and submits it, the way a launch delivers its prompt-after-start.
   * Throws `session-not-running` when the session is gone or its pane is dead. */
  send(handle: SessionHandle, text: string): Promise<void>;
  /** Throws `session-not-running` when the session is gone; a session that dies afterwards ends
   * the stream with exit instead. */
  terminal(handle: SessionHandle, size: TerminalSize): Promise<TerminalStream>;
  /** Idempotent; the exited event still fires exactly once. */
  stop(handle: SessionHandle): Promise<void>;
  /** Removes the worktree, keeps the branch unless asked; a no-op for folders. */
  clean(input: CleanInput): Promise<void>;
  detect(path: string, matchers: ProcessMatcher[]): Promise<DetectedHarness[]>;
  onEvent(cb: (e: SessionEvent) => void): () => void;
  /** Stops the watcher; kills no session. */
  close(): Promise<void>;
}
