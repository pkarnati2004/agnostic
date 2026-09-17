/** Remove is on the repo heading and in Closed, and both say the same thing about it (ADR 034). */
export function removeTooltip(name: string): string {
  return `Remove ${name}. Its task worktrees are deleted; its history is kept and it can be added again.`;
}
