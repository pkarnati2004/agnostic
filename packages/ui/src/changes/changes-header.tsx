import type { ChangesResponse, TaskListRow } from "@agnostic/core";
import { RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../components/badge";
import { HintText } from "../hint-text";
import { IconAction } from "../sidebar/icon-action";
import { adoptedLine, headerLine } from "./header-line";
import { CleanedLine } from "./panel-state";

type ChangesHeaderProps = {
  task: TaskListRow;
  /** Null until the first read lands, or after one fails: the title bar is drawn either way. */
  response: ChangesResponse | null;
  cleaned: boolean;
  loading: boolean;
  onRefresh: () => void;
  /** The same toggle the task header's Changes button calls. */
  onClose: () => void;
};

/** What the column is, and what the branch is judged against. */
export function ChangesHeader({ task, response, cleaned, loading, ...on }: ChangesHeaderProps) {
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-border border-b bg-sidebar px-3.5">
        <h2 className="type-heading">Changes</h2>
        {response !== null && <Badge variant="count">{response.files.length}</Badge>}
        <span className="ml-auto flex items-center gap-1">
          <IconAction
            label="Refresh the changes"
            tooltip="Refresh"
            disabled={loading}
            onClick={on.onRefresh}
            className="size-6"
          >
            <RefreshCw />
          </IconAction>
          <IconAction
            label="Close the Changes column"
            tooltip="Close"
            onClick={on.onClose}
            className="size-6"
          >
            <X />
          </IconAction>
        </span>
      </div>
      {response !== null && (
        <div className="border-border border-b px-3.5 py-2.5">
          {task.origin === "adopted" ? (
            <p className="type-meta">
              <HintText hint={adoptedLine(response)} />
            </p>
          ) : (
            <BranchLine response={response} />
          )}
          {cleaned && <CleanedLine branch={task.branch ?? "no branch"} />}
        </div>
      )}
    </>
  );
}

/** The branch, its base, and the three figures that say how far apart they have got. */
function BranchLine({ response }: { response: ChangesResponse }) {
  const line = headerLine(response);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground type-meta">
      <span className="min-w-0 truncate type-mono text-sidebar-foreground" title={line.branch}>
        {line.branch}
      </span>
      <span>vs</span>
      <span className="type-mono text-sidebar-foreground">{line.base}</span>
      <Dot />
      <span>{line.commits}</span>
      <Dot />
      <span>{line.uncommitted}</span>
      {line.behind !== null && (
        <>
          <Dot />
          <span style={{ color: "var(--warning)" }}>{line.behind}</span>
        </>
      )}
    </div>
  );
}

function Dot(): ReactNode {
  return <span className="text-input">·</span>;
}
