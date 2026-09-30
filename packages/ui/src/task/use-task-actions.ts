import type { HandoffTaskRequest, Task } from "@agnostic/core";
import type { Workspace } from "../store/use-workspace";
import type { TabsAction } from "../tabs/tabs-state";

/** The two actions that open a tab: a handoff opens the child, a run opens what it started. */
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
  // The run answered with the row, so the task is in the store before its event arrives.
  const started = (task: Task) => {
    put(task);
    dispatchTabs({ type: "open", taskId: task.id });
  };
  return { handoff, started };
}
