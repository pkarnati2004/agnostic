import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type AgnosticPaths = {
  home: string;
  db: string;
  authToken: string;
  config: string;
  worktrees: string;
  logs: string;
  daemon: string;
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
    // daemon.json is a hint, not truth: readers verify the pid is alive and the port answers.
    daemon: join(home, "daemon.json"),
  };
}

export function worktreePath(paths: AgnosticPaths, repoId: string, taskId: string): string {
  return join(paths.worktrees, repoId, taskId);
}
