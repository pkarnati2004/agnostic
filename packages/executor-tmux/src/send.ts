import type { SessionHandle } from "@agnostic/core";
import { ExecutorError } from "./error.js";
import { paneDead, pasteText, type TmuxClient } from "./tmux-client.js";

/**
 * One turn typed into a session that is already running, delivered the way a launch delivers its
 * prompt-after-start: the harness sees a paste and its own Enter, not a stream of keystrokes.
 */
export async function sendText(
  client: TmuxClient,
  handle: SessionHandle,
  text: string,
): Promise<void> {
  // Null is no such session and true is a pane whose process has exited: neither can be typed into.
  if ((await paneDead(client, handle.tmuxSession)) !== false) {
    throw new ExecutorError(`task ${handle.taskId} has no running session to type into`, {
      code: "session-not-running",
      hint: `Run \`agn resume ${handle.taskId}\` to start one.`,
    });
  }
  await pasteText(client, handle.tmuxSession, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}
