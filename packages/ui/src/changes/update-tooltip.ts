/**
 * What Bring up to date will ask the agent to do (ADR 036 Q6). The button itself arrives with the
 * endpoint behind it; the text is here because it is what the tooltip promises the user.
 */
export function updateTooltip(branch: string, base: string, pushed: boolean): string {
  const mode = pushed
    ? "merge from the base because it was pushed"
    : "rebase because the branch was never pushed";
  return (
    `Resume the agent in this worktree with a prompt to bring \`${branch}\` up to date with ` +
    `\`${base}\`, resolve conflicts and keep tests green: ${mode}. agn runs no git command itself.`
  );
}
