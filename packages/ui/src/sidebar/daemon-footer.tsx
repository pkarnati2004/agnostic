import type { ConnectionState } from "../store/workspace-state";

export type DaemonState = {
  /** From `GET /health` on load; null until it answers, and after it fails. */
  version: string | null;
  connection: ConnectionState;
};

/**
 * The foot of the sidebar: whether agnd is answering, and which one. It flips the moment the feed
 * drops, before the banner does, so the two are never both saying nothing (handoff pick 1).
 */
export function DaemonFooter({ version, connection }: DaemonState) {
  const live = connection === "live";
  const colour = live ? "var(--status-running)" : "var(--status-failed)";
  return (
    <footer
      className="flex h-9 shrink-0 items-center gap-2 border-sidebar-border border-t px-4 type-meta"
      style={{ color: live ? undefined : colour }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className={live ? "flex-1 text-muted-foreground" : "flex-1"}>
        {live ? "agnd running" : "agnd not running"}
      </span>
      {live && version !== null && (
        <span className="font-mono text-[11px] text-muted-foreground">{`v${version}`}</span>
      )}
    </footer>
  );
}
