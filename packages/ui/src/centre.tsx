import type {
  BudgetReport,
  HandoffTaskRequest,
  PickCompareResponse,
  Profile,
  RepoListRow,
  Task,
  TaskListRow,
} from "@agnostic/core";
import type { ReactNode } from "react";
import type { WorkspaceClient } from "./api/client";
import type { ApiError } from "./api/error";
import { CompareView } from "./compare/compare-view";
import { Notice } from "./notice";
import type { NoticeHost, TaskNotice, TaskNotices } from "./store/task-notices";
import type { UsageStamp } from "./store/workspace-state";
import type { ResumeNotice } from "./tabs/resume-notice";
import { type TabItem, TabStrip } from "./tabs/tab-strip";
import { compareIdOf, type TabsAction, type TabsState } from "./tabs/tabs-state";
import { TaskTabs } from "./tabs/task-tabs";
import { TaskHeader } from "./task/task-header";
import { UsageBar } from "./usage/usage-bar";
import type { UsageState } from "./usage/usage-state";

type CentreProps = {
  tabs: TabsState;
  dispatchTabs: (action: TabsAction) => void;
  repos: RepoListRow[];
  tasks: Record<string, TaskListRow>;
  loaded: boolean;
  profiles: Profile[];
  token: string;
  client: WorkspaceClient;
  usage: UsageState;
  /** The ceilings from config.yaml, read with the usage the bar draws; null until one arrives. */
  budget: BudgetReport | null;
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
  /** How many usage rows have landed per task, which is what makes a compare's read stale. */
  usageStamp: UsageStamp;
  /** Null when the daemon refused; the notice under the Compare view's header says why. */
  onPick: (compareId: string, taskId: string) => Promise<PickCompareResponse | null>;
  /** Counts the times the page was asked for the cost; each one brings the usage bar into view. */
  flash: number;
  /** The task whose handoff dialog the command palette opened, or null while none is open. */
  handoffFor: string | null;
  onHandoffFor: (taskId: string | null) => void;
};

/** The tab strip, the header for the tab in front, and every open terminal under them. */
export function Centre(props: CentreProps) {
  const { tabs, dispatchTabs, tasks, loaded, client, token } = props;
  const items = tabItems(tabs.open, tasks);
  const open = items.filter((item) => item.kind === "task").map((item) => item.task);
  const compareId = compareIdOf(tabs.active);
  // The Compare view is in front, so no terminal is: every one of them stays mounted and hidden.
  const active = compareId !== null || tabs.active === null ? undefined : tasks[tabs.active];
  const repoNames = new Map(props.repos.map((repo) => [repo.id, repo.name]));

  return (
    <main className="flex min-w-[640px] flex-col overflow-hidden">
      <TabStrip
        tabs={items}
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
          budget={props.budget}
          cost={props.cost}
          notice={props.notices[active.id] ?? null}
          onStop={() => props.onStop(active.id).then(() => undefined)}
          onResume={() => props.onResume(active.id, "header")}
          changesOpen={props.changesOpen}
          onToggleChanges={props.onToggleChanges}
          onHandoff={(body) => props.onHandoff(active, body)}
          handoffOpen={props.handoffFor === active.id}
          onHandoffOpenChange={(open) => props.onHandoffFor(open ? active.id : null)}
        />
      )}
      {/* The one failure with no task to sit on: the page never loaded. */}
      <Notice error={props.error} onDismiss={props.onDismiss} />
      {compareId !== null && (
        <CompareView
          compareId={compareId}
          siblings={siblingsOf(tasks, compareId)}
          client={client}
          notice={compareNotice(props.notices, tasks, compareId)}
          usageStamp={props.usageStamp}
          onOpenTask={(taskId) => dispatchTabs({ type: "open", taskId })}
          onPick={props.onPick}
        />
      )}
      {items.length === 0 && compareId === null && (
        <Centred>{emptyCentre(loaded, props.error !== null)}</Centred>
      )}
      <TaskTabs
        activeId={compareId === null ? tabs.active : null}
        tasks={open}
        token={token}
        client={client}
        resumed={props.resumed}
        notices={props.notices}
        onResume={(taskId) => props.onResume(taskId, "overlay")}
      />
      <UsageBar state={props.usage} flash={props.flash} />
    </main>
  );
}

/** The open tabs in order, each one resolved to what it draws; an id with nothing behind it is
 * dropped until the next prune closes it. */
function tabItems(open: string[], tasks: Record<string, TaskListRow>): TabItem[] {
  const items: TabItem[] = [];
  for (const id of open) {
    const compareId = compareIdOf(id);
    if (compareId === null) {
      const task = tasks[id];
      if (task !== undefined) {
        items.push({ kind: "task", id, task });
      }
      continue;
    }
    const siblings = siblingsOf(tasks, compareId);
    const first = siblings[0];
    if (first !== undefined) {
      items.push({ kind: "compare", id, title: first.title, agents: siblings.length });
    }
  }
  return items;
}

/** The group's tasks, oldest first, which is the order the profiles were given in. */
function siblingsOf(tasks: Record<string, TaskListRow>, compareId: string): TaskListRow[] {
  return Object.values(tasks)
    .filter((task) => task.compareId === compareId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A pick fails against one sibling, and the Compare view is where the click was. */
function compareNotice(
  notices: TaskNotices,
  tasks: Record<string, TaskListRow>,
  compareId: string,
): TaskNotice | null {
  const own: TaskNotice[] = [];
  for (const task of siblingsOf(tasks, compareId)) {
    const notice = notices[task.id];
    if (notice !== undefined && notice.host === "compare") {
      own.push(notice);
    }
  }
  // The newest, because an older failure is no longer what the daemon said about this group.
  return own.sort((a, b) => b.at - a.at)[0] ?? null;
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
