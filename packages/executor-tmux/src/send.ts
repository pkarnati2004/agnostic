import type { SessionHandle } from "@agnostic/core";
import { gateOnPane } from "./composer-wait.js";
import { ExecutorError } from "./error.js";
import type { LaunchDebug } from "./launch.js";
import { paneDead, pasteText, type TmuxClient } from "./tmux-client.js";

/**
 * One turn typed into a session that is already running, delivered the way a launch delivers its
 * prompt-after-start: the harness sees a paste and its own Enter, not a stream of keystrokes.
 */
export async function sendText(
  client: TmuxClient,
  handle: SessionHandle,
  text: string,
  debug: LaunchDebug = () => {},
): Promise<void> {
  // Null is no such session and true is a pane whose process has exited: neither can be typed into.
  if ((await paneDead(client, handle.tmuxSession)) !== false) {
    throw new ExecutorError(`task ${handle.taskId} has no running session to type into`, {
      code: "session-not-running",
      hint: `Run \`agn resume ${handle.taskId}\` to start one.`,
    });
  }
  // A paste onto a screen the harness put up is dropped, and the Enter behind it answers that
  // screen: the turn would be lost and an option picked for the user. Nothing is typed instead.
  // Only the gate is checked: a running turn repaints without pause and queues typed input.
  const gate = await gateOnPane(client, handle.tmuxSession);
  if (gate !== null) {
    debug("typed nothing into a pane showing a screen only the user can answer", {
      session: handle.tmuxSession,
      gate,
    });
    throw new ExecutorError(
      `task ${handle.taskId} is showing "${gate}", so nothing was typed into it`,
      {
        code: "agent-not-ready",
        hint: "Answer the screen in the task's terminal, then try again.",
      },
    );
  }
  await pasteText(client, handle.tmuxSession, text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}
