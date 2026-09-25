import type { Task } from "@agnostic/core";
import { HintText } from "../hint-text";
import { NoticeLine } from "../notice/notice-line";
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
    <NoticeLine tone="error">
      {noticeLine(notice, task)}
      {notice.error.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={notice.error.hint} />
        </span>
      )}
    </NoticeLine>
  );
}
