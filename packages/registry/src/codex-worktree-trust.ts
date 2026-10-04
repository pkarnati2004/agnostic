/**
 * ADR 035, amended 2026-09-28 (ruling a): Codex reads directory trust from the nearest `.git`, so a
 * linked worktree is never covered by the repo's `[projects."…"]` entry and every launch there stops
 * on "Do you trust the contents of this directory?". agn trusts the worktree it made itself, for
 * this launch only: nothing is written to the user's config.toml, and no approval or sandbox setting
 * is relaxed. A path that cannot be written as a TOML key is left alone rather than mangled.
 */
export function codexWorktreeTrustArgs(worktreePath: string): string[] {
  if (!tomlKeyable(worktreePath)) {
    return [];
  }
  return ["-c", `projects."${worktreePath}".trust_level="trusted"`];
}

function tomlKeyable(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.includes('"') &&
    !path.includes("\\") &&
    ![...path].some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f)
  );
}
