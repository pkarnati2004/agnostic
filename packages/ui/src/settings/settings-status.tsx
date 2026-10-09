import type { ReactNode } from "react";

/**
 * How a row reads at a glance. `running` and `failed` take the status colours the sidebar and the
 * terminal header use; `absent` is a hollow dot for a thing that is simply not there, which is not
 * a failure the reader has to act on.
 */
export type StatusTone = "running" | "failed" | "absent";

const COLOUR: Record<StatusTone, string> = {
  running: "var(--status-running)",
  failed: "var(--status-failed)",
  absent: "var(--muted-foreground)",
};

/** A dot and a word: what the agnd, tmux, detected-agent and API-key rows all end with. */
export function SettingsStatus({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const colour = COLOUR[tone];
  return (
    <span className="flex shrink-0 items-center gap-1.5 type-meta" style={{ color: colour }}>
      {/* A hollow dot is a border alone: "not there" should not read as a second lit state. */}
      <span
        aria-hidden
        className="size-1.5 rounded-full border"
        style={{
          borderColor: colour,
          backgroundColor: tone === "absent" ? "transparent" : colour,
        }}
      />
      {children}
    </span>
  );
}
