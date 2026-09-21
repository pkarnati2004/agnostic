import type { HandoffTaskRequest, Profile, RepoListRow, Task } from "@agnostic/core";
import { type ReactNode, useEffect, useMemo, useReducer, useState } from "react";
import { createClient, type WorkspaceClient } from "./api/client";
import type { ApiError } from "./api/error";
import { browserTokenSources, readToken } from "./auth/token";
import { cn } from "./class-names";
import { TooltipProvider } from "./components/tooltip";
import { Notice } from "./notice";
import { AddRepoDialog } from "./repo/add-repo-dialog";
import { RemoveRepoDialog } from "./repo/remove-repo-dialog";
import { useRepoActions } from "./repo/use-repo-actions";
import { activeRepos, defaultRepoId, groupTasks } from "./sidebar/group-tasks";
import { Sidebar } from "./sidebar/sidebar";
import type { NoticeHost, TaskNotices } from "./store/task-notices";
import { useProfiles } from "./store/use-profiles";
import { useWorkspace, type Workspace as WorkspaceStore } from "./store/use-workspace";
import type { WorkspaceState } from "./store/workspace-state";
import { type ResumeNotice, resumeNotice } from "./tabs/resume-notice";
import { TabStrip } from "./tabs/tab-strip";
import {
  readTabs,
  type TabsAction,
  type TabsState,
  tabbableTasks,
  tabsReducer,
  writeTabs,
} from "./tabs/tabs-state";
import { TaskTabs } from "./tabs/task-tabs";
import { NewTaskDialog } from "./task/new-task-dialog";
import { TaskHeader } from "./task/task-header";
import { TaskCost } from "./usage/task-cost";
import { UsageBar } from "./usage/usage-bar";
import type { UsageState } from "./usage/usage-state";
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
    <div
      className={cn("grid h-full", collapsed ? "grid-cols-[52px_1fr]" : "grid-cols-[240px_1fr]")}
    >
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
        onHandoff={handoff}
      />
    </div>
  );
}

type CentreProps = {
  tabs: TabsState;
  dispatchTabs: (action: TabsAction) => void;
  repos: RepoListRow[];
  tasks: Record<string, Task>;
  loaded: boolean;
  profiles: Profile[];
  token: string;
  client: WorkspaceClient;
  usage: UsageState;
  /** What the tab in front has spent; the page holds the hook that reads it. */
  cost: ReactNode;
  /** The bootstrap failure, and only that: every other failure is in `notices`. */
  error: ApiError | null;
  /** What the last resume had to say, for the tab it belongs to; the rest of the page ignores it. */
  resumed: ResumeNotice | null;
  /** Keyed by task: the latest failure per task, each drawn where its click was. */
  notices: TaskNotices;
  onDismiss: () => void;
  onResume: (taskId: string, host: NoticeHost) => Promise<void>;
  onStop: (taskId: string) => Promise<unknown>;
  onHandoff: (task: Task, body: HandoffTaskRequest) => Promise<boolean>;
};

/** The tab strip, the header for the tab in front, and every open terminal under them. */
function Centre(props: CentreProps) {
  const { tabs, dispatchTabs, tasks, loaded, client, token } = props;
  const open = tabs.open.map((id) => tasks[id]).filter((task) => task !== undefined);
  const active = tabs.active === null ? undefined : tasks[tabs.active];
  const repoNames = new Map(props.repos.map((repo) => [repo.id, repo.name]));

  return (
    <main className="flex min-w-[640px] flex-col overflow-hidden">
      <TabStrip
        tabs={open}
        activeId={tabs.active}
        repoNames={repoNames}
        onActivate={(taskId) => dispatchTabs({ type: "activate", taskId })}
        onClose={(taskId) => dispatchTabs({ type: "close", taskId })}
      />
      {active !== undefined && (
        <TaskHeader
          task={active}
          repo={props.repos.find((repo) => repo.id === active.repoId) ?? null}
          profiles={props.profiles}
          cost={props.cost}
          notice={props.notices[active.id] ?? null}
          onStop={() => props.onStop(active.id).then(() => undefined)}
          onResume={() => props.onResume(active.id, "header")}
          onHandoff={(body) => props.onHandoff(active, body)}
        />
      )}
      {/* The one failure with no task to sit on: the page never loaded. */}
      <Notice error={props.error} onDismiss={props.onDismiss} />
      {open.length === 0 ? (
        <Centred>{emptyCentre(loaded, props.error !== null)}</Centred>
      ) : (
        <TaskTabs
          state={tabs}
          tasks={open}
          token={token}
          client={client}
          resumed={props.resumed}
          notices={props.notices}
          onResume={(taskId) => props.onResume(taskId, "overlay")}
        />
      )}
      <UsageBar state={props.usage} />
    </main>
  );
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

/** With no tab open the centre says where the page got to; the notice above it says why. */
function emptyCentre(loaded: boolean, failed: boolean): string {
  if (loaded) {
    return "Pick a task on the left to open it.";
  }
  return failed ? "The workspace did not load." : "Loading the workspace…";
}

function Centred({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
      {children}
    </div>
  );
}
