import type {
  CompareResponse,
  CompareTaskRow,
  PickCompareResponse,
  TaskListRow,
} from "@agnostic/core";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { FailedLine } from "../changes/panel-state";
import { Dialog, DialogContent } from "../components/dialog";
import { IconAction } from "../sidebar/icon-action";
import type { TaskNotice } from "../store/task-notices";
import type { UsageStamp } from "../store/workspace-state";
import { TaskNoticeLine } from "../task/task-notice-line";
import { useTick } from "../time/use-tick";
import { CompareColumn } from "./compare-column";
import { lastCompare } from "./compare-state";
import { PickDialog } from "./pick-dialog";
import { useCompare } from "./use-compare";

// The elapsed times are minutes old at worst; a render every half minute keeps them honest.
const TICK_MS = 30_000;

type CompareViewProps = {
  compareId: string;
  /** The group's tasks from the page's own store: what makes the read of the compare stale. */
  siblings: TaskListRow[];
  client: WorkspaceClient;
  /** The latest pick failure among the siblings, drawn here because the click was here. */
  notice: TaskNotice | null;
  usageStamp: UsageStamp;
  onOpenTask: (taskId: string) => void;
  /** Null when the daemon refused, which the notice says; otherwise what the pick kept and cleaned. */
  onPick: (compareId: string, taskId: string) => Promise<PickCompareResponse | null>;
};

/** One column per agent of a compare, and the control that keeps one of them. */
export function CompareView(props: CompareViewProps) {
  const { compareId, siblings, client, notice, usageStamp } = props;
  const compare = useCompare(client, compareId, siblings, usageStamp);
  const [picking, setPicking] = useState<CompareTaskRow | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useTick(TICK_MS);
  const response = lastCompare(compare.state);

  const pick = async (taskId: string): Promise<void> => {
    setBusy(true);
    const kept = await props.onPick(compareId, taskId);
    setBusy(false);
    setPicking(null);
    if (kept !== null) {
      compare.refresh();
    }
  };

  if (response === null) {
    return compare.state.kind === "error" ? (
      <FailedLine error={compare.state.error} />
    ) : (
      <p className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Loading the compare…
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header
        response={response}
        loading={compare.state.kind === "loading"}
        onRefresh={compare.refresh}
      />
      {notice !== null && notice.host === "compare" && (
        <div className="px-4 py-2">
          <TaskNoticeLine notice={notice} task={{ title: response.title }} />
        </div>
      )}
      {compare.state.kind === "error" && <FailedLine error={compare.state.error} />}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {response.tasks.map((row) => (
          <CompareColumn
            key={row.id}
            row={row}
            picked={pickedAs(response, row)}
            busy={busy}
            now={now}
            onOpen={() => props.onOpenTask(row.id)}
            onPick={() => setPicking(row)}
          />
        ))}
      </div>
      <Dialog open={picking !== null} onOpenChange={(open) => setPicking(open ? picking : null)}>
        <DialogContent>
          {picking !== null && (
            <PickDialog
              row={picking}
              others={response.tasks.length - 1}
              onConfirm={() => pick(picking.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header({
  response,
  loading,
  onRefresh,
}: {
  response: CompareResponse;
  loading: boolean;
  onRefresh: () => void;
}) {
  const agents = `${response.tasks.length} agent${response.tasks.length === 1 ? "" : "s"}`;
  return (
    <div className="flex min-w-0 items-center gap-3 border-border border-b px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate type-heading" title={response.prompt}>
          {response.title}
        </h2>
        <p className="truncate text-muted-foreground type-meta">
          {`${agents}, same prompt, separate worktrees. Pick one to keep; the others close.`}
        </p>
      </div>
      <IconAction
        label="Refresh the compare"
        tooltip="Refresh"
        disabled={loading}
        onClick={onRefresh}
      >
        <RefreshCw />
      </IconAction>
    </div>
  );
}

/** A pick leaves one sibling standing and removes the worktrees of the rest (ADR 036 Q7). */
function pickedAs(response: CompareResponse, row: CompareTaskRow): "kept" | "removed" | null {
  if (response.pickedTaskId === null) {
    return null;
  }
  return row.id === response.pickedTaskId ? "kept" : "removed";
}
