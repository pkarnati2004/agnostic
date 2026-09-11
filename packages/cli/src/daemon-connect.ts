import { join } from "node:path";
import {
  type AgnosticPaths,
  createDaemonClient,
  DaemonApiError,
  type DaemonClient,
  probeDaemon,
  readAuthToken,
} from "@agnostic/core";
import type { Output } from "./context.js";
import { type DaemonEntry, runDaemonCommand } from "./daemon-entry.js";

type ConnectOptions = {
  paths: AgnosticPaths;
  entry: DaemonEntry;
  io: Output;
  run?: typeof runDaemonCommand;
};

// Enough of the daemon's own complaint to see why it stopped, without pasting the log into stderr.
const REASON_LINES = 5;

/**
 * The daemon is an implementation detail of the CLI, so the first command on a fresh machine
 * starts it rather than telling the user to. The one line it prints goes to stderr, out of the
 * way of anything reading stdout. `agn daemon status` and `agn daemon stop` never get here: they
 * run the daemon bin directly and never ask for a client.
 */
export async function connect(opts: ConnectOptions): Promise<DaemonClient> {
  const probe = await probeDaemon(opts.paths);
  const running = probe.state === "running" ? probe.info : null;
  const info = running ?? (await start(opts));
  return createDaemonClient({
    baseUrl: `http://127.0.0.1:${info.port}`,
    token: await readAuthToken(opts.paths),
  });
}

async function start(opts: ConnectOptions): Promise<{ port: number }> {
  const started = await (opts.run ?? runDaemonCommand)(opts.entry, ["start"]);
  const probe = await probeDaemon(opts.paths);
  if (started.exitCode !== 0 || probe.state !== "running" || probe.info === null) {
    // Only stderr: the daemon writes its reason there, and stdout would be its "started" line.
    const reason = lastLines(started.stderr);
    throw new DaemonApiError(`the agn daemon could not be started${reason}`, {
      code: "daemon-start-failed",
      hint: `See ${join(opts.paths.logs, "agnd.log")} or run \`agn daemon start\`.`,
      status: null,
    });
  }
  opts.io.err(`agn: started the daemon on port ${probe.info.port}`);
  return probe.info;
}

function lastLines(stderr: string): string {
  const lines = stderr.trimEnd().split("\n").slice(-REASON_LINES).join("\n");
  return lines === "" ? "" : `\n${lines}`;
}
