/** What the socket said as it closed, and whether the daemon had already reported an exit. */
export type CloseContext = { code: number; reason: string; sawExit: boolean };

/**
 * One line for the overlay, or null when the close needs no explaining. The browser never learns
 * the HTTP status of a refused upgrade - every refusal arrives as 1006 - so this says what the
 * close code alone can say, and the task itself is what the view re-reads for the rest.
 */
export function closeNotice(ctx: CloseContext): string | null {
  if (ctx.sawExit && ctx.code === 1000) {
    return null;
  }
  switch (ctx.code) {
    case 1001:
      return "The daemon is restarting.";
    case 1006:
      return "Connection lost.";
    case 1008:
      return `The daemon refused the terminal protocol${detail(ctx.reason)}.`;
    case 1011:
      return `The terminal could not open${detail(ctx.reason)}.`;
    default:
      return `Connection closed (${ctx.code}).`;
  }
}

function detail(reason: string): string {
  return reason === "" ? "" : `: ${reason}`;
}
