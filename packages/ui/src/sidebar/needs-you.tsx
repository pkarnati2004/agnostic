import type { TaskListRow } from "@agnostic/core";
import { cn } from "../class-names";
import { StatusGlyph } from "../status/status-glyph";
import { formatElapsed } from "../time/elapsed";
import { Section } from "./section";

type NeedsYouProps = {
  /** The waiting tasks, oldest question first (`group-tasks.ts`). */
  tasks: TaskListRow[];
  repoNames: ReadonlyMap<string, string>;
  selectedId: string | null;
  /** The page's 30 s tick, so every waiting time on the page reads the same clock. */
  now: number;
  onSelect: (id: string) => void;
};

/**
 * The tasks asking a question, above the repos and nowhere else. A row is the halo glyph, the title
 * and how long it has waited: the repo is in the row's title attribute, because a question is about
 * the task rather than where it is. Nothing waiting means no strip at all (GAPS item 2a).
 */
export function NeedsYou({ tasks, repoNames, selectedId, now, onSelect }: NeedsYouProps) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <Section title="Needs you" count={tasks.length} tone="waiting">
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          title={`${task.title} · ${repoNames.get(task.repoId) ?? "unknown repo"}`}
          onClick={() => onSelect(task.id)}
          className={cn(
            "flex items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left",
            "hover:bg-sidebar-accent focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          )}
          style={
            task.id === selectedId
              ? { backgroundColor: "color-mix(in srgb, var(--status-waiting) 9%, transparent)" }
              : undefined
          }
        >
          <StatusGlyph status="waiting" />
          <span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
          <span
            className="shrink-0 font-mono text-[11px]"
            style={{ color: "var(--status-waiting)" }}
          >
            {formatElapsed(task.updatedAt, now)}
          </span>
        </button>
      ))}
    </Section>
  );
}
