import type { TaskStatus } from "@agnostic/core";
import { cn } from "../class-names";
import { STATUS_DOT } from "./status-dot";
import { StatusGlyph } from "./status-glyph";

/** Done and stopped are over: a neutral pill, not a coloured one. */
const SETTLED: TaskStatus[] = ["done", "stopped"];

/**
 * The status as a word on a tinted pill, with whatever the caller has to add after it: how long the
 * task has waited, what failed. One place writes the status word, so a header and a row agree.
 */
export function StatusPill({ status, detail }: { status: TaskStatus; detail?: string | null }) {
  const { token, label } = STATUS_DOT[status];
  const settled = SETTLED.includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] rounded-[10px] px-2 py-0.5 type-meta",
        // Waiting is the one status that asks for something, so its word carries the extra weight.
        status === "waiting" && "font-medium",
        settled && "text-muted-foreground",
      )}
      style={{
        backgroundColor: settled
          ? "var(--muted)"
          : `color-mix(in srgb, var(${token}) 14%, transparent)`,
        color: settled ? undefined : `var(${token})`,
      }}
    >
      <StatusGlyph status={status} size="tab" />
      {detail == null ? label : `${label} · ${detail}`}
    </span>
  );
}
