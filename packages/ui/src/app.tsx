import type {
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  HandoffTaskRequest,
  RepoListRow,
  Task,
  UpdateTaskResponse,
} from "@agnostic/core";
import { useEffect, useMemo, useReducer, useState } from "react";
import { createClient } from "./api/client";
import type { ApiError } from "./api/error";
import { browserTokenSources, readToken } from "./auth/token";
import { Centre, Centred } from "./centre";
import { ChangesPanel } from "./changes/changes-panel";
import { readPanelOpen, writePanelOpen } from "./changes/panel-open";
import { cn } from "./class-names";
import { TooltipProvider } from "./components/tooltip";
import { AddRepoDialog } from "./repo/add-repo-dialog";
import { RemoveRepoDialog } from "./repo/remove-repo-dialog";
import { useRepoActions } from "./repo/use-repo-actions";
import { activeRepos, defaultRepoId, groupTasks } from "./sidebar/group-tasks";
import { Sidebar } from "./sidebar/sidebar";
import type { NoticeHost } from "./store/task-notices";
import { useProfiles } from "./store/use-profiles";
import { useWorkspace, type Workspace as WorkspaceStore } from "./store/use-workspace";
import type { WorkspaceState } from "./store/workspace-state";
import { type ResumeNotice, resumeNotice } from "./tabs/resume-notice";
import {
  readTabs,
  type TabsAction,
  type TabsState,
  tabbableTasks,
  tabsReducer,
  writeTabs,
} from "./tabs/tabs-state";
import { NewTaskDialog } from "./task/new-task-dialog";
import { TaskCost } from "./usage/task-cost";
import { useTaskUsage } from "./usage/use-task-usage";
import { useUsage } from "./usage/use-usage";

const TOOLTIP_DELAY_MS = 400;

export function App() {
  // The fragment is read once, on the first render of the page it arrived with.
  const token = useMemo(() => readToken(browserTokenSources()), []);
  if (token === null) {
    return <Centred>Open the workspace with `agn ui`.</Centred>;
  }
  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <Workspace token={token} />
    </TooltipProvider>
  );
}

function Workspace({ token }: { token: string }) {
  const client = useMemo(() => createClient({ token }), [token]);
  const { state, error, notices, act, put } = useWorkspace(client);
  const profiles = useProfiles(client);
  const [collapsed, setCollapsed] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [addRepo, setAddRepo] = useState(false);
  // The repo the Remove confirmation is about, or null while it is closed.
  const [removing, setRemoving] = useState<RepoListRow | null>(null);
  const repoActions = useRepoActions(client);
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  const [changesOpen, setChangesOpen] = useState(() =>
    readPanelOpen(localStorage, window.innerWidth),
  );
  const [tabs, dispatchTabs] = useReducer(tabsReducer, undefined, () => readTabs(localStorage));
  const groups = useMemo(
    () => groupTasks(state.repos, Object.values(state.tasks)),
    [state.repos, state.tasks],
  );
  const usage = useUsage(client, state.usageStamp.plans);
  const activeId = tabs.active;
  const taskUsage = useTaskUsage(
    client,
    activeId,
    activeId === null ? 0 : (state.usageStamp.byTask[activeId] ?? 0),
  );
  useTabsStorage(tabs, state, dispatchTabs);

  const activeTask = activeId === null ? null : (state.tasks[activeId] ?? null);
  const showChanges = changesOpen && activeTask !== null;
  const toggleChanges = () => {
    writePanelOpen(localStorage, !changesOpen);
    setChangesOpen(!changesOpen);
  };
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

  const { handoff, started } = useTaskActions(act, put, dispatchTabs);
  const [resumed, setResumed] = useState<ResumeNotice | null>(null);
  // What was said is the response's, not the row's, so the tab hears it from the call that resumed.
  const resume = async (taskId: string, host: NoticeHost): Promise<void> => {
    await act({ taskId, action: "resume", host }, async (api) => {
      const response = await api.resumeTask(taskId);
      setResumed({ taskId, notice: resumeNotice(response) });
      return response.task;
    });
  };

  return (
    <div className={cn("grid h-full", gridColumns(collapsed, showChanges))}>
      <Sidebar
        groups={groups}
        repos={state.repos}
        selectedId={tabs.active}
        collapsed={collapsed}
        onSelect={(taskId) => dispatchTabs({ type: "open", taskId })}
        onNewTask={() => setNewTask(true)}
        onAddRepo={() => setAddRepo(true)}
        onCloseRepo={repoActions.close}
        onReopenRepo={repoActions.reopen}
        onRemoveRepo={(repoId) =>
          setRemoving(state.repos.find((repo) => repo.id === repoId) ?? null)
        }
        repoNotices={repoActions.notices}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <AddRepoDialog
        open={addRepo}
        onOpenChange={setAddRepo}
        client={client}
        onReopen={repoActions.reopen}
      />
      <RemoveRepoDialog
        repo={removing}
        onOpenChange={(open) => setRemoving(open ? removing : null)}
        onRemove={repoActions.remove}
      />
      <NewTaskDialog
        open={newTask}
        onOpenChange={setNewTask}
        repos={activeRepos(state.repos)}
        defaultRepoId={defaultRepoId(state, tabs.active)}
        profiles={profiles}
        client={client}
        onStarted={started}
      />
      <Centre
        tabs={tabs}
        dispatchTabs={dispatchTabs}
        repos={state.repos}
        tasks={state.tasks}
        loaded={state.loaded}
        profiles={profiles}
        token={token}
        client={client}
        usage={usage}
        cost={<TaskCost usage={taskUsage} />}
        error={error === dismissed ? null : error}
        notices={notices}
        onDismiss={() => setDismissed(error)}
        resumed={resumed}
        onResume={resume}
        onStop={(taskId) =>
          act(
            { taskId, action: "stop", host: "header" },
            async (api) => (await api.stopTask(taskId)).task,
          )
        }
        changesOpen={changesOpen}
        onToggleChanges={toggleChanges}
        onHandoff={handoff}
      />
      {showChanges && activeTask !== null && (
        <ChangesPanel
          task={activeTask}
          client={client}
          notice={notices[activeTask.id] ?? null}
          onOpen={(editor) => openInEditor(activeTask.id, editor)}
          onCreatePr={(body) => createPr(activeTask.id, body)}
          onUpdate={() => update(activeTask.id)}
        />
      )}
    </div>
  );
}

/** The Changes column takes its 360 px from the centre, which keeps its own 640 px minimum. */
function gridColumns(collapsed: boolean, changes: boolean): string {
  if (collapsed) {
    return changes ? "grid-cols-[52px_1fr_360px]" : "grid-cols-[52px_1fr]";
  }
  return changes ? "grid-cols-[240px_1fr_360px]" : "grid-cols-[240px_1fr]";
}

/**
 * The tab list outlives the page; a task that has been cleaned takes its tab with it, and so does a
 * repo that has been removed. The repo comes from state, not from the click, so `agn repo remove`
 * run elsewhere closes the tabs on its `repo.updated` event too.
 */
function useTabsStorage(
  tabs: TabsState,
  state: Pick<WorkspaceState, "loaded" | "repos" | "tasks">,
  dispatchTabs: (action: TabsAction) => void,
): void {
  const { loaded, repos, tasks } = state;
  useEffect(() => {
    writeTabs(localStorage, tabs);
  }, [tabs]);
  useEffect(() => {
    if (loaded) {
      dispatchTabs({ type: "prune", keep: tabbableTasks(repos, tasks) });
    }
  }, [loaded, repos, tasks, dispatchTabs]);
}

/** The two actions that open a tab: a handoff opens the child, a run opens what it started. */
function useTaskActions(
  act: WorkspaceStore["act"],
  put: WorkspaceStore["put"],
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
