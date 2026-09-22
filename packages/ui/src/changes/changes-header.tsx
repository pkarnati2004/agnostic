import type { ChangesResponse, TaskListRow } from "@agnostic/core";
import { Badge } from "../components/badge";
import { HintText } from "../hint-text";
import { adoptedLine, headerLine } from "./header-line";
import { CleanedLine } from "./panel-state";

type ChangesHeaderProps = {
  task: TaskListRow;
  response: ChangesResponse;
  cleaned: boolean;
};

/** What the branch is, what it is judged against, and how far apart the two have got. */
export function ChangesHeader({ task, response, cleaned }: ChangesHeaderProps) {
  const line = headerLine(response);
  return (
    <div className="border-border border-b px-4 py-3">
      {task.origin === "adopted" ? (
        <p className="text-sm">
          <HintText hint={adoptedLine(response)} />
        </p>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span dir="rtl" className="min-w-0 truncate text-left font-mono" title={line.branch}>
              {line.branch}
            </span>
            <span className="shrink-0 text-muted-foreground">→</span>
            <span className="shrink-0 font-mono text-muted-foreground">{line.base}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
            <span>{`${line.commits}, ${line.uncommitted}`}</span>
            {line.behind !== null && <Badge variant="outline">{line.behind}</Badge>}
          </div>
        </>
      )}
      {cleaned && <CleanedLine branch={task.branch ?? "no branch"} />}
    </div>
  );
}
