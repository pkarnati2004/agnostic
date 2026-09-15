import { z } from "zod";

// What flows over `WS /tasks/:id/terminal` (ADR 025). The fetch API's shapes are in daemon-api.ts;
// these are the socket's, and the daemon, the executor and the workspace all read them from here.

/**
 * `WS /tasks/:id/terminal` carries the token as a subprotocol, `agn-token.<token>`, because a
 * browser cannot set a header on an upgrade (ADR 026). The daemon echoes it back on accept.
 */
export const TERMINAL_TOKEN_PROTOCOL = "agn-token.";

/**
 * The only text frame a terminal client sends; everything else it sends is pty bytes. The first
 * frame must be a resize: it sizes the pty, and `ready` follows it before the redraw (ADR 025).
 */
export const TerminalClientFrameSchema = z.strictObject({
  type: z.literal("resize"),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
});
export type TerminalClientFrame = z.infer<typeof TerminalClientFrameSchema>;

/** Text frames down: `ready` once the pty is sized, `exit` when this tmux client ends. */
export type TerminalServerFrame = { type: "ready" } | { type: "exit"; code?: number };
