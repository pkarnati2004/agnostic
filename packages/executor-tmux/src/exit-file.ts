/**
 * `~/.agnostic/sessions/agn-<task>.<launch>.exit`: the pane-died hook writes it, the watcher reads
 * it. A resume reuses the tmux session name, so the launch id is what tells this run's exit from
 * the previous run's - both in the file name and in the event the watcher emits.
 */
const SUFFIX = ".exit";

export type ExitFile = { session: string; launchId: string | null };

export function exitFileName(session: string, launchId: string): string {
  return `${session}.${launchId}${SUFFIX}`;
}

/** Neither a task id nor a launch id contains a `.`, so the last segment is always the launch. */
export function parseExitFileName(name: string): ExitFile | null {
  if (!name.endsWith(SUFFIX)) {
    return null;
  }
  const stem = name.slice(0, -SUFFIX.length);
  const cut = stem.lastIndexOf(".");
  if (cut === -1) {
    // Written before launch ids existed; the watcher still reports it, with no launch to match.
    return stem === "" ? null : { session: stem, launchId: null };
  }
  const session = stem.slice(0, cut);
  const launchId = stem.slice(cut + 1);
  return session === "" || launchId === "" ? null : { session, launchId };
}

/** Every exit file a session could have left behind, whichever launch wrote it. */
export function isExitFileFor(name: string, session: string): boolean {
  return parseExitFileName(name)?.session === session;
}
