#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { CoreError, errorMessage } from "@agnostic/core";
import { DaemonError } from "./error.js";
import { daemonStatus, restartDaemon, startDaemon, stopDaemon } from "./lifecycle.js";
import { runDaemon } from "./server.js";

const USAGE = "usage: agnd run|start|stop|status|restart [--port <n>] [--force]";

// Restart this bin exactly the way it was started, so `start` works from source and from dist.
const ENTRY = [process.execPath, ...process.execArgv, fileURLToPath(import.meta.url)];

type Flags = { port?: number; force: boolean };

/** `agn daemon <cmd>` (chunk 6) execs this bin, so the CLI never has to import the daemon. */
async function main(argv: string[]): Promise<number | null> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const port = flags.port;
  switch (command) {
    case "run": {
      // Stays in the foreground: the returned handle is closed by SIGINT or SIGTERM.
      const daemon = await runDaemon(port === undefined ? {} : { port });
      process.stdout.write(`agnd listening on 127.0.0.1:${daemon.port}\n`);
      return null;
    }
    case "start": {
      const info = await startDaemon({ entry: ENTRY, ...(port === undefined ? {} : { port }) });
      process.stdout.write(`agnd started pid=${info.pid} port=${info.port}\n`);
      return 0;
    }
    case "stop": {
      await stopDaemon({});
      process.stdout.write("agnd stopped\n");
      return 0;
    }
    case "restart": {
      const restarted = {
        force: flags.force,
        entry: ENTRY,
        ...(port === undefined ? {} : { port }),
      };
      const info = await restartDaemon(restarted);
      process.stdout.write(`agnd restarted pid=${info.pid} port=${info.port}\n`);
      return 0;
    }
    case "status":
      return status();
    default:
      throw new DaemonError(`unknown command "${command ?? ""}"`, {
        code: "request-invalid",
        hint: USAGE,
      });
  }
}

/** Exit 0 running, 2 stale or foreign, 1 stopped, so a script can branch without parsing text. */
async function status(): Promise<number> {
  const probe = await daemonStatus({});
  if (probe.state === "running" && probe.info !== null) {
    process.stdout.write(`running pid=${probe.info.pid} port=${probe.info.port}\n`);
    return 0;
  }
  if (probe.state === "foreign") {
    const home = probe.health?.home ?? "an unknown home";
    process.stdout.write(
      `foreign (pid ${probe.health?.pid ?? "?"} on port ${probe.info?.port ?? "?"} serves ${home})\n`,
    );
    return 2;
  }
  if (probe.state === "stale") {
    process.stdout.write(`stale (pid ${probe.info?.pid ?? "?"} not answering)\n`);
    return 2;
  }
  process.stdout.write("stopped\n");
  return 1;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { force: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--force") {
      flags.force = true;
      continue;
    }
    if (arg === "--port") {
      i += 1;
      const value = Number(args[i]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new DaemonError(`--port needs a number from 0 to 65535, not "${args[i] ?? ""}"`, {
          code: "request-invalid",
          hint: USAGE,
        });
      }
      flags.port = value;
      continue;
    }
    throw new DaemonError(`unknown flag "${arg ?? ""}"`, { code: "request-invalid", hint: USAGE });
  }
  return flags;
}

const code = await main(process.argv.slice(2)).catch((cause: unknown) => {
  const message = errorMessage(cause);
  const hint = cause instanceof CoreError && cause.hint !== undefined ? `\n${cause.hint}` : "";
  process.stderr.write(`agnd: ${message}${hint}\n`);
  return 1;
});
// `run` answers null because it has not finished: the process lives until a signal closes it.
if (code !== null) {
  process.exit(code);
}
