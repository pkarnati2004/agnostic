import { CompareRow } from "./compare-row";
import type { CompareGroup, SidebarRow } from "./group-tasks";
import { TaskRow } from "./task-row";

export type CompareRowsProps = {
  /** Which compare rows the user has opened or closed by hand; the rest follow the default. */
  openCompares: ReadonlyMap<string, boolean>;
  /** `expanded` is what the row should show next, so nothing else has to know the default. */
  onToggleCompare: (compareId: string, expanded: boolean) => void;
  onOpenCompare: (compareId: string) => void;
};

type SidebarRowsProps = CompareRowsProps & {
  rows: SidebarRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** A repo's rows, live or in History: a task is one row and a compare stands for its siblings. */
export function SidebarRows({ rows, selectedId, onSelect, ...on }: SidebarRowsProps) {
  return (
    <>
      {rows.map((row) =>
        row.kind === "task" ? (
          <TaskRow
            key={row.task.id}
            task={row.task}
            repoName={null}
            selected={row.task.id === selectedId}
            onSelect={onSelect}
          />
        ) : (
          <CompareRow
            key={row.group.compareId}
            group={row.group}
            selectedId={selectedId}
            expanded={expandedRow(row.group, on.openCompares)}
            onToggle={(compareId) =>
              on.onToggleCompare(compareId, !expandedRow(row.group, on.openCompares))
            }
            onOpenCompare={on.onOpenCompare}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  );
}

const LIVE = ["queued", "running", "waiting"];

/** Open while there is an agent to watch, closed once none is running, unless the user said otherwise. */
function expandedRow(group: CompareGroup, open: ReadonlyMap<string, boolean>): boolean {
  const said = open.get(group.compareId);
  if (said !== undefined) {
    return said;
  }
  return group.tasks.some((task) => LIVE.includes(task.status));
}
