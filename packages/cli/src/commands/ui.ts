import { join } from "node:path";
import { launchDetached, readAuthToken, readDaemonInfo } from "@agnostic/core";
import { Command } from "commander";
import type { CliContext } from "../context.js";
import { CliError } from "../error.js";

type UiFlags = { open: boolean };

// What the opener prints if it prints anything; agn's own output never mentions the token.
const UI_LOG = "agn-ui.log";

/**
 * The workspace, in the browser. The token rides in the URL fragment, which the browser keeps to
 * itself: it reaches no request line, no access log and no terminal (ADR 026).
 */
export function uiCommand(ctx: CliContext, platform: NodeJS.Platform = process.platform): Command {
  return new Command("ui")
    .description("open the workspace in your browser")
    .option("--no-open", "print the address instead of opening a browser")
    .action(async (flags: UiFlags, command: Command) => {
      if (ctx.json) {
        // The workspace is a page, not a response: there is no body to hand a script.
        command.error("error: --json is not supported by agn ui", {
          exitCode: 2,
          code: "commander.unknownOption",
        });
      }
      // Starts a daemon if none is running, like every other command (ADR 012).
      await ctx.client();
      const url = await workspaceUrl(ctx);
      const token = await readAuthToken(ctx.paths);
      const opened = `${url}#token=${token}`;
      if (!flags.open) {
        // The one place the token is printed, and only because the user asked to open it herself.
        ctx.io.out(opened);
        return;
      }
      await openBrowser(ctx, platform, opened, token);
      ctx.io.out(`opened ${url}`);
    });
}

/** The port of the daemon that just answered, not the one config.yaml asks for (ADR 012). */
async function workspaceUrl(ctx: CliContext): Promise<string> {
  const info = await readDaemonInfo(ctx.paths);
  if (info === null) {
    throw new CliError(`agn cannot tell which port the daemon is on: no ${ctx.paths.daemon}`, {
      code: "daemon-info-missing",
      hint: "Run `agn daemon start`.",
    });
  }
  return `http://127.0.0.1:${info.port}/ui`;
}

/**
 * The platform's own opener, detached, so the browser outlives agn. Its argv holds the token for
 * as long as the opener runs, which ADR 026 accepts; nothing agn writes down repeats it.
 */
async function openBrowser(
  ctx: CliContext,
  platform: NodeJS.Platform,
  url: string,
  token: string,
): Promise<void> {
  const opener = platform === "darwin" ? "open" : "xdg-open";
  try {
    await launchDetached(ctx.spawn, [opener, url], {
      env: ctx.env,
      logFile: join(ctx.paths.logs, UI_LOG),
    });
  } catch (cause) {
    throw new CliError(`could not open a browser: ${redact(cause, token)}`, {
      code: "browser-open-failed",
      hint: "Run `agn ui --no-open` and open the printed address yourself.",
    });
  }
}

/** A failing child quotes the command line it was given, and that line carries the token. */
function redact(cause: unknown, token: string): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return detail.replaceAll(token, "…");
}
