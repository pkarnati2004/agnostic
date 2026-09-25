import type {
  AskCommitResponse,
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  UpdateTaskResponse,
} from "@agnostic/core";
import type { Workspace } from "../store/use-workspace";

/**
 * The four calls the Changes panel makes on the task in front. Each one answers with something the
 * store's task row does not carry - the editor that opened, the pull request's URL and description,
 * which way the agent was asked to work - so the caller gets the response and the failure goes to
 * the panel as a notice.
 */
export function useChangesActions(act: Workspace["act"]) {
  // The open answers with the editor it started, not with the task, so only a failure is drawn.
  const openInEditor = async (taskId: string, editor: EditorId | null): Promise<void> => {
    await act({ taskId, action: "open", host: "panel" }, async (api) => {
      await api.openTask(taskId, editor === null ? {} : { editor });
      return undefined;
    });
  };

  // The response is the dialog's: it holds the URL and the description, which no row carries.
  const createPr = async (
    taskId: string,
    body: CreatePrRequest,
  ): Promise<CreatePrResponse | null> => {
    let created: CreatePrResponse | null = null;
    await act({ taskId, action: "pr", host: "dialog" }, async (api) => {
      created = await api.createPr(taskId, body);
      return created.task;
    });
    return created;
  };

  // The panel draws what the agent was asked to do, so the response comes back to it.
  const update = async (taskId: string): Promise<UpdateTaskResponse | null> => {
    let asked: UpdateTaskResponse | null = null;
    await act({ taskId, action: "update", host: "panel" }, async (api) => {
      asked = await api.updateTask(taskId);
      return asked.task;
    });
    return asked;
  };

  const askCommit = async (taskId: string): Promise<AskCommitResponse | null> => {
    let asked: AskCommitResponse | null = null;
    await act({ taskId, action: "commit", host: "panel" }, async (api) => {
      asked = await api.askCommit(taskId);
      return asked.task;
    });
    return asked;
  };

  return { openInEditor, createPr, update, askCommit };
}
