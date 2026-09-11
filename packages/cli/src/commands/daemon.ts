import { Command } from "commander";
import type { CliContext } from "../context.js";
import { runDaemonCommand } from "../daemon-entry.js";

type DaemonFlags = { port?: string; force?: boolean };

/**
 * The daemon runs as a child of this command, never as an import: the CLI stays a client of the
 * HTTP API even when it is the thing starting the server.
 */
export function daemonCommand(ctx: CliContext): Command {
  const daemon = new Command("daemon").description("start, stop or inspect the agn daemon");
  daemon
    .command("start")
    .description("start the daemon")
    .option("--port <n>", "listen on this port instead of the configured one")
    .action((flags: DaemonFlags, command: Command) =>
      forward(ctx, command, ["start", ...port(flags)]),
    );
  daemon
    .command("stop")
    .description("stop the daemon")
    .action((_flags: DaemonFlags, command: Command) => forward(ctx, command, ["stop"]));
  daemon
    .command("status")
    .description("report whether the daemon is running (exit 0 running, 1 stopped, 2 stale)")
    .action((_flags: DaemonFlags, command: Command) => forward(ctx, command, ["status"]));
  daemon
    .command("restart")
    .description("stop the daemon and start it again")
    .option("--port <n>", "listen on this port instead of the configured one")
    .option("--force", "kill a daemon that is alive but no longer answering")
    .action((flags: DaemonFlags, command: Command) =>
      forward(ctx, command, [
        "restart",
        ...(flags.force === true ? ["--force"] : []),
        ...port(flags),
      ]),
    );
  return daemon;
}

function port(flags: DaemonFlags): string[] {
  return flags.port === undefined ? [] : ["--port", flags.port];
}

async function forward(ctx: CliContext, command: Command, args: string[]): Promise<void> {
  if (ctx.json) {
    // agnd answers in prose and through its exit code; there is no response body to hand over.
    command.error("error: --json is not supported by agn daemon", {
      exitCode: 2,
      code: "commander.unknownOption",
    });
  }
  const result = await runDaemonCommand(ctx.entry, args);
  write(result.stdout, (line) => ctx.io.out(line));
  write(result.stderr, (line) => ctx.io.err(line));
  // `status` answers with its code rather than with text, so agn exits with whatever agnd returned.
  ctx.exitCode = result.exitCode;
}

function write(text: string, line: (text: string) => void): void {
  for (const one of text.split("\n")) {
    if (one !== "") {
      line(one);
    }
  }
}
