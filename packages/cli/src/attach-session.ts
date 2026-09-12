import type { CliContext } from "./context.js";

/**
 * The terminal belongs to tmux from here until the user detaches, so stdio is inherited and agn
 * exits with whatever tmux exits with. TMUX and TMUX_PANE are dropped: with either set, tmux
 * refuses to nest, and agn's own server is not the one the user is sitting in.
 */
export async function handOverTerminal(ctx: CliContext, argv: string[]): Promise<number> {
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
