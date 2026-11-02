import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type AgnosticPaths, agnosticPaths, errorMessage, type TmuxReport } from "@agnostic/core";
import { daemonArgv, daemonEnv, type EnsureResult, type ensureDaemon } from "./daemon-launch.js";
import { redact } from "./shell-log.js";
import type { StatusState } from "./status-page.js";

export type ShellPage = { kind: "workspace"; url: string } | { kind: "status"; state: StatusState };

export type StartDeps = {
  /** The login shell's env, captured once per app start; every call after the first is cached. */
  env: () => Promise<{ env: Record<string, string>; source: "login-shell" | "fallback" }>;
  /** The staged app directory that holds `agnd/agnd.js`. */
  appRoot: string;
  ensureDaemon: typeof ensureDaemon;
  readToken: (paths: AgnosticPaths) => Promise<string>;
  /** `POST /doctor` through core's client; the daemon reads `tmux -V` on its own PATH. */
  tmux: (baseUrl: string, token: string) => Promise<TmuxReport>;
  log: (line: string) => void;
};

/** The one place the steps are ordered: env, paths, daemon, token, the tmux check, the page. */
export async function nextPage(deps: StartDeps): Promise<ShellPage> {
  const { env, source } = await deps.env();
  const home = homeFor(env);
  const paths = agnosticPaths(home);
  deps.log(
    `start: home ${home}, env from the ${source === "fallback" ? "fallback" : "login shell"}`,
  );
  const result = await ensure(deps, paths, daemonEnv(env, home));
  if (result.kind !== "running") {
    deps.log(`start: daemon ${result.kind}`);
    return { kind: "status", state: result };
  }
  const { port, pid } = result.info;
  deps.log(`start: ${result.reused ? "reused" : "started"} agnd pid ${pid} on port ${port}`);
  const baseUrl = `http://127.0.0.1:${port}`;
  let token = "";
  try {
    token = await deps.readToken(paths);
    const tmux = await deps.tmux(baseUrl, token);
    if (!tmux.ok) {
      deps.log(`start: tmux ${tmux.version ?? "missing"} is too old or absent`);
      return { kind: "status", state: { kind: "tmux", version: tmux.version } };
    }
  } catch (cause) {
    deps.log(
      `start: agnd answered but the tmux check failed: ${redact(errorMessage(cause), token)}`,
    );
    return { kind: "status", state: { kind: "failed", logFile: join(paths.logs, "agnd.log") } };
  }
  return { kind: "workspace", url: `${baseUrl}/ui#token=${token}` };
}

/** `agn` in a terminal reads AGNOSTIC_HOME, else ~/.agnostic, from the same env the app captured. */
export function homeFor(env: Record<string, string>): string {
  const override = env.AGNOSTIC_HOME;
  return override ? resolve(override) : join(env.HOME ?? homedir(), ".agnostic");
}

async function ensure(
  deps: StartDeps,
  paths: AgnosticPaths,
  env: Record<string, string>,
): Promise<EnsureResult> {
  try {
    return await deps.ensureDaemon({ paths, argv: daemonArgv(deps.appRoot), env });
  } catch (cause) {
    deps.log(`start: agnd could not be spawned: ${errorMessage(cause)}`);
    return { kind: "failed", logFile: join(paths.logs, "agnd.log") };
  }
}
