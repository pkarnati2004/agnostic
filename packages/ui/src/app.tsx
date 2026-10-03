import type {
  AskCommitResponse,
  ChangesResponse,
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  PickCompareResponse,
  RepoListRow,
  UpdateTaskResponse,
} from "@agnostic/core";
import { useMemo, useReducer, useState } from "react";
import { createClient } from "./api/client";
import type { ApiError } from "./api/error";
import { browserTokenSources, readToken } from "./auth/token";
import { Centre, Centred } from "./centre";
import { ChangesPanel } from "./changes/changes-panel";
import { readPanelOpen, writePanelOpen } from "./changes/panel-open";
import { cn } from "./class-names";
import { TooltipProvider } from "./components/tooltip";
import { WorkspacePalette } from "./palette/workspace-palette";
import { AddRepoDialog } from "./repo/add-repo-dialog";
import { RemoveRepoDialog } from "./repo/remove-repo-dialog";
import { useRepoActions } from "./repo/use-repo-actions";
import { activeRepos, defaultRepoId, groupTasks } from "./sidebar/group-tasks";
import { Sidebar } from "./sidebar/sidebar";
import type { NoticeHost } from "./store/task-notices";
import { useProfiles } from "./store/use-profiles";
import { useWorkspace } from "./store/use-workspace";
import { type ResumeNotice, resumeNotice } from "./tabs/resume-notice";
import { compareTabId, readTabs, tabsReducer } from "./tabs/tabs-state";
import { useTabsStorage } from "./tabs/use-tabs-storage";
import { NewTaskDialog } from "./task/new-task-dialog";
import { useTaskActions } from "./task/use-task-actions";
import { TaskCost } from "./usage/task-cost";
import { lastResponse } from "./usage/usage-state";
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
  // What the palette's "Run: <prompt>" seeds the new-task dialog with, or null for a blank one.
  const [prefill, setPrefill] = useState<{ prompt: string } | null>(null);
  const [addRepo, setAddRepo] = useState(false);
  // The task whose handoff dialog, and whose Create PR dialog, the palette has opened.
  const [handoffFor, setHandoffFor] = useState<string | null>(null);
  const [prFor, setPrFor] = useState<string | null>(null);
  // Counts the times the palette's Cost row was run; the usage bar reads it and shows itself.
  const [flash, setFlash] = useState(0);
  // The repo the Remove confirmation is about, or null while it is closed.
  const [removing, setRemoving] = useState<RepoListRow | null>(null);
  const repoActions = useRepoActions(client);
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  const [changesOpen, setChangesOpen] = useState(() =>
    readPanelOpen(localStorage, window.innerWidth),
  );
  // The last Changes read, kept with the task it was about: the palette needs the count and only
  // the panel fetches it, so a task the panel has not read yet has none.
  const [read, setRead] = useState<{ taskId: string; uncommitted: number } | null>(null);
  const [tabs, dispatchTabs] = useReducer(tabsReducer, undefined, () => readTabs(localStorage));
  const groups = useMemo(
    () => groupTasks(state.repos, Object.values(state.tasks)),
    [state.repos, state.tasks],
  );
  const usage = useUsage(client, state.usageStamp.plans);
  // The budget rides on the usage body the bar already reads; no dialog asks for it on its own.
  const budget = lastResponse(usage)?.budget ?? null;
  const activeId = tabs.active;
  const taskUsage = useTaskUsage(
    client,
    activeId,
    activeId === null ? 0 : (state.usageStamp.byTask[activeId] ?? 0),
  );
  useTabsStorage(tabs, state, dispatchTabs);

  const activeTask = activeId === null ? null : (state.tasks[activeId] ?? null);
  const uncommitted = read !== null && read.taskId === activeId ? read.uncommitted : null;
  // The tab in front's repo, or the first in the sidebar: what a new task and the palette's Run,
  // Recommend and Sync rows act on.
  const repo = state.repos.find((row) => row.id === defaultRepoId(state, activeId)) ?? null;
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

  const askCommit = async (taskId: string): Promise<AskCommitResponse | null> => {
    let asked: AskCommitResponse | null = null;
    await act({ taskId, action: "commit", host: "panel" }, async (api) => {
      asked = await api.askCommit(taskId);
      return asked.task;
    });
    return asked;
  };

  // The view holds the response: it says what was cleaned, which no row of the store carries.
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
        onOpenCompare={(compareId) =>
          dispatchTabs({ type: "open", taskId: compareTabId(compareId) })
        }
        onNewTask={() => {
          setPrefill(null);
          setNewTask(true);
        }}
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
        defaultRepoId={repo?.id ?? null}
        profiles={profiles}
        budget={budget}
        prefill={prefill}
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
        budget={budget}
        cost={<TaskCost usage={taskUsage} />}
        error={error === dismissed ? null : error}
        notices={notices}
        onDismiss={() => setDismissed(error)}
        resumed={resumed}
        onResume={resume}
        onStop={stop}
        changesOpen={changesOpen}
        onToggleChanges={toggleChanges}
        onHandoff={handoff}
        handoffFor={handoffFor}
        onHandoffFor={setHandoffFor}
        flash={flash}
        usageStamp={state.usageStamp}
        onPick={pick}
      />
      {showChanges && activeTask !== null && (
        <ChangesPanel
          task={activeTask}
          client={client}
          notice={notices[activeTask.id] ?? null}
          onOpen={(editor) => openInEditor(activeTask.id, editor)}
          onCreatePr={(body) => createPr(activeTask.id, body)}
          onUpdate={() => update(activeTask.id)}
          onAskCommit={() => askCommit(activeTask.id)}
          onLoaded={(response: ChangesResponse) =>
            setRead({ taskId: response.task.id, uncommitted: response.uncommitted })
          }
          prOpen={prFor === activeTask.id}
          onPrOpenChange={(open) => setPrFor(open ? activeTask.id : null)}
        />
      )}
      <WorkspacePalette
        client={client}
        context={{ activeTask, repo, uncommitted }}
        onStarted={started}
        handlers={{
          newTask: (seed) => {
            setPrefill(seed);
            setNewTask(true);
          },
          stop: (taskId) => void stop(taskId),
          resume: (taskId) => void resume(taskId, "header"),
          handoff: setHandoffFor,
          openInEditor: (taskId) => void openInEditor(taskId, null),
          createPr: (taskId) => {
            writePanelOpen(localStorage, true);
            setChangesOpen(true);
            setPrFor(taskId);
          },
          update: (taskId) => void update(taskId),
          commit: (taskId) => void askCommit(taskId),
          showCost: () => setFlash((count) => count + 1),
          addRepo: () => setAddRepo(true),
          // The sidebar draws the failure under the repo's heading; a rejection here has no reader.
          sync: (repoId) => void repoActions.sync(repoId).catch(() => undefined),
        }}
      />
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
