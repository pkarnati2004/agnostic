import { type EditorId, EditorIdSchema, type OpenTaskResponse, taskLogPath } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { launchDetached } from "../launch-detached.js";
import { requireTaskId } from "../resolve-repo.js";

type OpenFlags = { editor?: string };

// VS Code is the one editor whose command is not its id, and `code` is what people type.
const ALIASES: Record<string, EditorId> = { code: "vscode" };

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

/** The editor's own failure, said in the editor's name: the launch itself is the shared part. */
async function launch(ctx: CliContext, response: OpenTaskResponse): Promise<void> {
  const log = taskLogPath(ctx.paths, response.task.id);
  if (response.argv.length === 0) {
    throw failed(response, "the daemon named no command to run", log);
  }
  try {
    await launchDetached(ctx, response.argv, log);
  } catch (cause) {
    throw failed(response, cause instanceof Error ? cause.message : String(cause), log);
  }
}

function failed(response: OpenTaskResponse, detail: string, log: string): CliError {
  return new CliError(`${response.editor.name} could not open ${response.dir}: ${detail}`, {
    code: "editor-failed",
    hint: `Anything it printed is in ${log}.`,
  });
}
