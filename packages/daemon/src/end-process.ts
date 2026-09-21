import { type HarnessId, isProcessAlive } from "@agnostic/core";
import { pidRunsHarness } from "@agnostic/executor-tmux";
import { harnessDefinition } from "@agnostic/registry";

const GRACE_MS = 5_000;
const POLL_MS = 100;

/** "not-the-harness" is a pid the kernel handed to somebody else after the agent exited unseen. */
export type ProcessEnd = "signalled" | "gone" | "not-the-harness";

/**
 * An adopted session runs in the person's own terminal, not on agn's tmux server, so its pid is
 * the only handle a stop has. The escalation matches the executor's (`executor-tmux/src/stop.ts`):
 * SIGTERM first, so a harness that exits on its own can write its last transcript line, then
 * SIGKILL once the grace period is over. The pid is checked against the harness's own process
 * names first: agn signals nothing it cannot show is still the agent it adopted.
 */
export async function endProcess(pid: number, harness: HarnessId): Promise<ProcessEnd> {
  if (!isProcessAlive(pid)) {
    return "gone";
  }
  if (!(await pidRunsHarness(pid, harnessDefinition(harness).processNames))) {
    return "not-the-harness";
  }
  if (!signal(pid, "SIGTERM")) {
    return "gone";
  }
  const deadline = Date.now() + GRACE_MS;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return "signalled";
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  signal(pid, "SIGKILL");
  return "signalled";
}

/** True when the signal reached a process. ESRCH is one that has gone; EPERM is one that is there. */
function signal(pid: number, sig: NodeJS.Signals): boolean {
  try {
    process.kill(pid, sig);
    return true;
  } catch (cause) {
    return cause instanceof Error && "code" in cause && cause.code === "EPERM";
  }
}
