import type { HandoffTaskRequest, Profile, RepoListRow, Task } from "@agnostic/core";
import type { ReactNode } from "react";
import type { WorkspaceClient } from "./api/client";
import type { ApiError } from "./api/error";
import { Notice } from "./notice";
import type { NoticeHost, TaskNotices } from "./store/task-notices";
import type { ResumeNotice } from "./tabs/resume-notice";
import { TabStrip } from "./tabs/tab-strip";
import type { TabsAction, TabsState } from "./tabs/tabs-state";
import { TaskTabs } from "./tabs/task-tabs";
import { TaskHeader } from "./task/task-header";
import { UsageBar } from "./usage/usage-bar";
import type { UsageState } from "./usage/usage-state";

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
  /** The Changes column's toggle lives in the task header, and its state in the page. */
  changesOpen: boolean;
  onToggleChanges: () => void;
  onDismiss: () => void;
  onResume: (taskId: string, host: NoticeHost) => Promise<void>;
  onStop: (taskId: string) => Promise<unknown>;
  onHandoff: (task: Task, body: HandoffTaskRequest) => Promise<boolean>;
};

/** The tab strip, the header for the tab in front, and every open terminal under them. */
export function Centre(props: CentreProps) {
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
          changesOpen={props.changesOpen}
          onToggleChanges={props.onToggleChanges}
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

/** With no tab open the centre says where the page got to; the notice above it says why. */
function emptyCentre(loaded: boolean, failed: boolean): string {
  if (loaded) {
    return "Pick a task on the left to open it.";
  }
  return failed ? "The workspace did not load." : "Loading the workspace…";
}

export function Centred({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
      {children}
    </div>
  );
}
