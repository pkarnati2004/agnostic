import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type AgnosticPaths = {
  home: string;
  db: string;
  authToken: string;
  config: string;
  worktrees: string;
  logs: string;
  sessions: string;
  daemon: string;
  hooks: string;
};

export function agnosticHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AGNOSTIC_HOME;
  return override ? resolve(override) : join(homedir(), ".agnostic");
}

export function agnosticPaths(home: string = agnosticHome()): AgnosticPaths {
  return {
    home,
    db: join(home, "agnostic.db"),
    authToken: join(home, "auth-token"),
    config: join(home, "config.yaml"),
    worktrees: join(home, "worktrees"),
    logs: join(home, "logs"),
    // One file per tmux session, written by its pane-died hook and read back as the exit status.
    sessions: join(home, "sessions"),
    // daemon.json is a hint, not truth: readers verify the pid is alive and the port answers.
    daemon: join(home, "daemon.json"),
    // The one script every harness hook runs, written at daemon start.
    hooks: join(home, "hooks"),
  };
}

/** One log per task under the state directory: setup output now, anything unattended later. */
export function taskLogPath(paths: AgnosticPaths, taskId: string): string {
  return join(paths.logs, "tasks", `${taskId}.log`);
}

export function worktreePath(paths: AgnosticPaths, repoId: string, taskId: string): string {
  return join(paths.worktrees, repoId, taskId);
}
