import type { HandoffTaskRequest, PickCompareResponse, Task } from "@agnostic/core";
import type { Workspace } from "../store/use-workspace";
import { NEW_TASK_TAB, type TabsAction } from "../tabs/tabs-state";

/** The actions the page itself makes, rather than a panel or a row: each one needs the tab strip
 * or the response, which no component below `app.tsx` holds. */
export function useTaskActions(
  act: Workspace["act"],
  put: Workspace["put"],
  dispatchTabs: (action: TabsAction) => void,
) {
  // Answers the dialog: false leaves it open with the failure in it, where the profile can change.
  const handoff = async (task: Task, body: HandoffTaskRequest) => {
    const scope = { taskId: task.id, action: "handoff" as const, host: "dialog" as const };
    const child = await act(scope, async (api) => (await api.handoffTask(task.id, body)).task);
    if (child === undefined) {
      return false;
    }
    dispatchTabs({ type: "open", taskId: child.id });
    return true;
  };
  // The run answered with the row, so the task is in the store before its event arrives. The
  // composer has done its job once the task exists, so its tab gives way to the task's own.
  const started = (task: Task) => {
    put(task);
    dispatchTabs({ type: "open", taskId: task.id });
    dispatchTabs({ type: "close", taskId: NEW_TASK_TAB });
  };
  // The Compare view holds the response: it says what was cleaned, which no row of the store carries.
  const pick = async (compareId: string, taskId: string): Promise<PickCompareResponse | null> => {
    let picked: PickCompareResponse | null = null;
    await act({ taskId, action: "pick", host: "compare" }, async (api) => {
      picked = await api.pickCompare(compareId, { taskId });
      return picked.kept;
    });
    return picked;
  };
  const stop = (taskId: string) =>
    act(
      { taskId, action: "stop", host: "header" },
      async (api) => (await api.stopTask(taskId)).task,
    );
  return { handoff, started, pick, stop };
}
