import { readFileSync } from "node:fs";
import { Command, CommanderError } from "commander";
import { addCommand } from "./commands/add.js";
import { adoptCommand } from "./commands/adopt.js";
import { attachCommand } from "./commands/attach.js";
import { cleanCommand } from "./commands/clean.js";
import { daemonCommand } from "./commands/daemon.js";
import { doctorCommand } from "./commands/doctor.js";
import { hooksCommand } from "./commands/hooks.js";
import { initCommand } from "./commands/init.js";
import { profilesCommand } from "./commands/profiles.js";
import { recommendCommand } from "./commands/recommend.js";
import { reposCommand } from "./commands/repos.js";
import { resumeCommand } from "./commands/resume.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";
import { syncCommand } from "./commands/sync.js";
import type { CliContext, Output } from "./context.js";
import { renderError } from "./render-error.js";

// Help and version have printed all they had to say before they threw.
const SELF_EXPLAINED = new Set(["commander.help", "commander.helpDisplayed", "commander.version"]);

export function createProgram(ctx: CliContext, version: string): Command {
  const program = new Command()
    .name("agn")
    .description("one workspace above every coding agent")
    .version(version)
    // Commander recognises a program option before or after the subcommand, so `agn --json repos`
    // and `agn repos --json` are the same command line and there is one declaration of the flag.
    .option("--json", "print the daemon's response as JSON")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => write(text, ctx.io, "out"),
      writeErr: (text) => write(text, ctx.io, "err"),
      // renderError is the one place a failure is printed, in the form the user asked for.
      outputError: () => undefined,
    });

  for (const command of [
    daemonCommand(ctx),
    addCommand(ctx),
    reposCommand(ctx),
    doctorCommand(ctx),
    profilesCommand(ctx),
    recommendCommand(ctx),
    runCommand(ctx),
    statusCommand(ctx),
    attachCommand(ctx),
    resumeCommand(ctx),
    stopCommand(ctx),
    cleanCommand(ctx),
    adoptCommand(ctx),
    hooksCommand(ctx),
    initCommand(ctx),
    syncCommand(ctx),
  ]) {
    program.addCommand(command);
  }
  program.hook("preAction", (_program, action) => {
    const flags: { json?: boolean } = action.optsWithGlobals();
    ctx.json = flags.json === true;
  });
  // addCommand does not hand down the settings that .command() does, and a subcommand left to
  // itself would call process.exit rather than throw.
  inherit(program);
  return program;
}

export async function runMain(argv: string[], ctx: CliContext): Promise<number> {
  const program = createProgram(ctx, packageVersion());
  try {
    await program.parseAsync(argv);
    return ctx.exitCode;
  } catch (cause) {
    if (cause instanceof CommanderError && SELF_EXPLAINED.has(cause.code)) {
      return cause.exitCode === 0 ? 0 : 2;
    }
    const rendered = renderError(cause);
    if (ctx.json) {
      ctx.io.err(JSON.stringify(rendered.body));
    } else {
      for (const line of rendered.lines) {
        ctx.io.err(line);
      }
    }
    return rendered.exitCode;
  }
}

function inherit(command: Command): void {
  for (const child of command.commands) {
    child.copyInheritedSettings(command);
    inherit(child);
  }
}

/** Commander writes whole blocks; blank lines inside help are part of the layout and survive. */
function write(text: string, io: Output, stream: "out" | "err"): void {
  for (const line of text.replace(/\n$/, "").split("\n")) {
    io[stream](line);
  }
}

/** The manifest is the one copy of the version, and it sits one level above src/ and dist/ alike. */
function packageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    version?: string;
  };
  return manifest.version ?? "0.0.0";
}
