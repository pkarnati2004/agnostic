import { run } from "@agnostic/core";
import type { CliContext } from "./context.js";

/**
 * Long enough for a clipboard tool to take the text, short enough that a tool which stays in the
 * foreground does not hold the command: the body is printed instead.
 */
const COPY_TIMEOUT_MS = 5_000;

const DARWIN = [["pbcopy"]];
/** Wayland first, then X11: a Wayland session usually has both, and wl-copy is the one that works. */
const ELSEWHERE = [["wl-copy"], ["xclip", "-selection", "clipboard"]];

/** True when a clipboard tool took the text; false when this machine has none that would. */
export async function copyToClipboard(
  ctx: CliContext,
  text: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  for (const [command, ...args] of platform === "darwin" ? DARWIN : ELSEWHERE) {
    if (command === undefined) {
      continue;
    }
    try {
      await run(command, args, {
        input: text,
        env: ctx.env,
        inheritEnv: false,
        timeoutMs: COPY_TIMEOUT_MS,
      });
      return true;
    } catch {
      // Not installed, or it refused: the next tool gets a turn, and the caller prints the body.
    }
  }
  return false;
}
