import type { Task } from "@agnostic/core";
import { HintText } from "../hint-text";
import { noticeLine, type TaskNotice } from "../store/task-notices";

/** What the daemon said about one click, beside the button that raised it. It clears itself. */
export function TaskNoticeLine({
  notice,
  task,
}: {
  notice: TaskNotice;
  task: Pick<Task, "title">;
}) {
  return (
    <div role="alert" className="min-w-0">
      <p className="text-destructive text-sm">{noticeLine(notice, task)}</p>
      {notice.error.hint !== null && (
        <p className="mt-1 text-muted-foreground text-xs">
          <HintText hint={notice.error.hint} />
        </p>
      )}
    </div>
  );
}
