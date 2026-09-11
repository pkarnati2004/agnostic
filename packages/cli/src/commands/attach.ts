import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

export function attachCommand(ctx: CliContext): Command {
  return new Command("attach")
    .description("join a task's session in this terminal")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const response = await client.attachInfo(await requireTaskId(ctx, command, task));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      ctx.exitCode = await handOver(ctx, response.attach.argv);
    });
}

/**
 * The terminal belongs to tmux from here until the user detaches, so stdio is inherited and agn
 * exits with whatever tmux exits with. TMUX and TMUX_PANE are dropped: with either set, tmux
 * refuses to nest, and agn's own server is not the one the user is sitting in.
 */
async function handOver(ctx: CliContext, argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === undefined) {
    return 1;
  }
  const { TMUX: _tmux, TMUX_PANE: _pane, ...env } = ctx.env;
  try {
    const result = await ctx.spawn(command, args, { stdio: "inherit", inheritEnv: false, env });
    return result.exitCode ?? 0;
  } catch (cause) {
    // tmux exiting non-zero - no sessions, not a terminal - is its answer, not a failure of agn:
    // it has already said why on the terminal it was given, so agn only passes the code on.
    return exitCodeOf(cause);
  }
}

function exitCodeOf(cause: unknown): number {
  if (typeof cause === "object" && cause !== null && "exitCode" in cause) {
    const code: unknown = cause.exitCode;
    if (typeof code === "number" && code !== 0) {
      return code;
    }
  }
  // A spawn that never became a process (tmux missing) is agn's failure to report, not tmux's.
  return 1;
}
