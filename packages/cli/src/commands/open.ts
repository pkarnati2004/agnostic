import {
  type EditorId,
  EditorIdSchema,
  type OpenTaskResponse,
  ProcessError,
  type spawn,
  taskLogPath,
} from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { requireTaskId } from "../resolve-repo.js";

type OpenFlags = { editor?: string };

// VS Code is the one editor whose command is not its id, and `code` is what people type.
const ALIASES: Record<string, EditorId> = { code: "vscode" };

/**
 * How long a launch gets to fail in. `open` reports a missing application in milliseconds, and a
 * PATH shim that is still alive after three seconds is an editor that stayed in the foreground.
 */
const FAILURE_WINDOW_MS = 3_000;

export function openCommand(ctx: CliContext): Command {
  return new Command("open")
    .description("open a task's directory in your editor")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .option("--editor <id>", "which editor; defaults to `editor` in ~/.agnostic/config.yaml")
    .action(async (task: string | undefined, flags: OpenFlags, command: Command) => {
      const client = await ctx.client();
      const id = await requireTaskId(ctx, command, task);
      const response = await client.openInfo(id, editorId(flags.editor, command));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      await launch(ctx, response);
      ctx.io.out(`opened ${response.dir} in ${response.editor.name}`);
    });
}

/** The wire value is always the id, whichever of its names the user typed. */
function editorId(flag: string | undefined, command: Command): EditorId | undefined {
  if (flag === undefined) {
    return undefined;
  }
  const parsed = EditorIdSchema.safeParse(ALIASES[flag] ?? flag);
  if (parsed.success) {
    return parsed.data;
  }
  return command.error(`error: --editor must be one of ${EditorIdSchema.options.join(", ")}`, {
    exitCode: 2,
    code: "commander.invalidArgument",
  });
}

/**
 * Detached and with agn's own environment, so the editor joins the user's login session and
 * outlives the command (ADR 023). agn waits out the failure window before it lets go.
 */
async function launch(ctx: CliContext, response: OpenTaskResponse): Promise<void> {
  const [command, ...args] = response.argv;
  const log = taskLogPath(ctx.paths, response.task.id);
  if (command === undefined) {
    throw failed(response, "the daemon named no command to run", log);
  }
  const child = ctx.spawn(command, args, {
    detached: true,
    inheritEnv: false,
    env: ctx.env,
    logFile: log,
  });
  const failure = await earlyFailure(child, FAILURE_WINDOW_MS);
  if (failure !== null) {
    throw failed(response, failure, log);
  }
  child.unref();
}

/** Why the editor died inside the window, or null: it exited cleanly, or it is still running. */
async function earlyFailure(
  child: ReturnType<typeof spawn>,
  windowMs: number,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), windowMs);
  });
  try {
    // `.then` here is also what keeps a later failure from becoming an unhandled rejection.
    return await Promise.race([
      child.then(
        () => null,
        (cause: unknown) => reason(cause),
      ),
      window,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Output goes to the task log, so a ProcessError usually carries no stderr of its own.
function reason(cause: unknown): string {
  if (cause instanceof ProcessError && cause.stderr !== "") {
    return cause.stderr;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function failed(response: OpenTaskResponse, detail: string, log: string): CliError {
  return new CliError(`${response.editor.name} could not open ${response.dir}: ${detail}`, {
    code: "editor-failed",
    hint: `Anything it printed is in ${log}.`,
  });
}
