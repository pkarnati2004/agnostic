// Adapted from asheshgoplani/agent-deck (MIT © Ashesh Goplani).
// Claude Code 2.1.27 and later ignore the SIGHUP `kill-session` sends, so a session whose pane is
// killed first can leave the harness running.
import type { SessionHandle } from "@agnostic/core";
import type { ProcessProbe } from "./process-table.js";
import { hasSession, killSession, paneDead, panePid, type TmuxClient } from "./tmux-client.js";

const GRACE_MS = 5_000;
const POLL_MS = 100;

/** Idempotent: a session that is already gone resolves at once, and the exit event still fires. */
export async function stopSession(
  client: TmuxClient,
  handle: SessionHandle,
  probe: ProcessProbe,
): Promise<void> {
  const name = handle.tmuxSession;
  if (!(await hasSession(client, name))) {
    return;
  }
  const pid = await panePid(client, name);
  if (pid === null) {
    await killSession(client, name);
    return;
  }
  const tree = [pid, ...(await probe.descendants(pid))];
  const names = new Map<number, string | null>();
  for (const member of tree) {
    names.set(member, await probe.comm(member));
  }
  // SIGTERM first: a harness that exits on its own writes the exit file the watcher reads.
  probe.signal(pid, "SIGTERM");
  if (!(await paneDiedWithin(client, name, GRACE_MS))) {
    for (const member of await survivors(tree, names, probe)) {
      probe.signal(member, "SIGKILL");
    }
  }
  await killSession(client, name);
}

/** A pid that came back with a different name is a recycled pid, and someone else's process. */
export async function survivors(
  tree: number[],
  names: Map<number, string | null>,
  probe: ProcessProbe,
): Promise<number[]> {
  const still: number[] = [];
  for (const pid of tree) {
    if (!probe.alive(pid)) {
      continue;
    }
    if ((await probe.comm(pid)) !== (names.get(pid) ?? null)) {
      continue;
    }
    still.push(pid);
  }
  return still;
}

async function paneDiedWithin(client: TmuxClient, name: string, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // null is "no session left", which is as dead as the pane can be.
    if ((await paneDead(client, name)) !== false) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}
