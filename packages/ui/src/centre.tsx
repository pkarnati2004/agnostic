import type {
  BudgetReport,
  HandoffTaskRequest,
  PickCompareResponse,
  Profile,
  RepoListRow,
  Task,
  TaskListRow,
  TaskUsageResponse,
} from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "./api/client";
import type { ApiError } from "./api/error";
import { CompareView } from "./compare/compare-view";
import { Notice } from "./notice";
import { CatalogNotice } from "./notice/catalog-notice";
import { DaemonBanner } from "./notice/daemon-banner";
import { activeRepos } from "./sidebar/group-tasks";
import type { NoticeHost, TaskNotice, TaskNotices } from "./store/task-notices";
import type { ConnectionState, UsageStamp } from "./store/workspace-state";
import type { ResumeNotice } from "./tabs/resume-notice";
import { type TabItem, TabStrip } from "./tabs/tab-strip";
import { compareIdOf, NEW_TASK_TAB, type TabsAction, type TabsState } from "./tabs/tabs-state";
import { TaskTabs } from "./tabs/task-tabs";
import { NewTaskTab } from "./task/new-task-tab";
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
  taskUsage: TaskUsageResponse | null;
  /** Re-reads `GET /usage` at once: the usage bar asks for it after it writes a plan. */
  refreshUsage: () => void;
  /** How many files the Changes panel found on its last read of the tab in front; null before one. */
  files: number | null;
  /** The bootstrap failure, and only that: every other failure is in `notices`. */
  error: ApiError | null;
  /** Where the page stands with the daemon, which is what the banner watches. */
  connection: ConnectionState;
  /** Opens the feed again: the banner's Retry. */
  onRetry: () => void;
  /** The page's 30 s tick, read by the catalog line. */
  now: number;
  /** What the last resume had to say, for the tab it belongs to; the rest of the page ignores it. */
  resumed: ResumeNotice | null;
  /** Keyed by task: the latest failure per task, each drawn where its click was. */
  notices: TaskNotices;
  /** The Changes column's toggle lives in the task header, and its state in the page. */
  changesOpen: boolean;
  onToggleChanges: () => void;
  onResume: (taskId: string, host: NoticeHost) => Promise<void>;
  onStop: (taskId: string) => Promise<unknown>;
  onHandoff: (task: Task, body: HandoffTaskRequest) => Promise<boolean>;
  /** How many usage rows have landed per task, which is what makes a compare's read stale. */
  usageStamp: UsageStamp;
  /** Null when the daemon refused; the notice under the Compare view's header says why. */
  onPick: (compareId: string, taskId: string) => Promise<PickCompareResponse | null>;
  /** Counts the times the page was asked for the cost; each one brings the usage bar into view. */
  flash: number;
  /** The repo a new task starts in: the tab in front's, else the first in the sidebar. */
  defaultRepoId: string | null;
  /** What the New task tab's prompt starts as, from the palette's "Run: <prompt>". */
  seed: { prompt: string; at: number } | null;
  /** The task the New task tab started: the page opens its tab and closes the composer's. */
  onStarted: (task: Task) => void;
  onAddRepo: () => void;
  /** The task whose handoff dialog the command palette opened, or null while none is open. */
  handoffFor: string | null;
  onHandoffFor: (taskId: string | null) => void;
  /** The "+" at the end of the tab strip, which is the same New task the sidebar offers. */
  onNewTask: () => void;
};

/** The tab strip, the header for the tab in front, and every open terminal under them. */
export function Centre(props: CentreProps) {
  const { tabs, dispatchTabs, tasks, loaded, client, token } = props;
  const items = tabItems(tabs.open, tasks);
  const open = items.filter((item) => item.kind === "task").map((item) => item.task);
  const compareId = compareIdOf(tabs.active);
  const composing = tabs.active === NEW_TASK_TAB;
  const composerOpen = tabs.open.includes(NEW_TASK_TAB);
  // With no tab in front the centre is the composer too, under the design's first-run heading.
  const starter = items.length === 0 && compareId === null && loaded;
  // The Compare view is in front, so no terminal is: every one of them stays mounted and hidden.
  const active = compareId !== null || tabs.active === null ? undefined : tasks[tabs.active];
  const repoNames = new Map(props.repos.map((repo) => [repo.id, repo.name]));
  const dropped = useDropped(props.connection);

  return (
    <main className="flex min-w-[640px] flex-col overflow-hidden">
      {/* With no repo yet there is nothing to start a task in, so the strip stays away entirely. */}
      {(items.length > 0 || activeRepos(props.repos).length > 0) && (
        <TabStrip
          tabs={items}
          activeId={tabs.active}
          repoNames={repoNames}
          onActivate={(taskId) => dispatchTabs({ type: "activate", taskId })}
          onClose={(taskId) => dispatchTabs({ type: "close", taskId })}
          onNewTask={props.onNewTask}
        />
      )}
      {active !== undefined && (
        <TaskHeader
          task={active}
          repo={props.repos.find((repo) => repo.id === active.repoId) ?? null}
          profiles={props.profiles}
          budget={props.budget}
          files={props.files}
          notice={props.notices[active.id] ?? null}
          onStop={() => props.onStop(active.id).then(() => undefined)}
          onResume={() => props.onResume(active.id, "header")}
          changesOpen={props.changesOpen}
          onToggleChanges={props.onToggleChanges}
          client={client}
          onHandoff={(body) => props.onHandoff(active, body)}
          handoffOpen={props.handoffFor === active.id}
          onHandoffOpenChange={(open) => props.onHandoffFor(open ? active.id : null)}
        />
      )}
      <DaemonBanner
        shown={props.error?.code === "daemon-unreachable" || dropped}
        onRetry={props.onRetry}
      />
      {/* The one failure with no task to sit on: the page never loaded. A daemon that did not
          answer is the banner's line, not a second one saying the same thing. */}
      <Notice error={props.error?.code === "daemon-unreachable" ? null : props.error} />
      <CatalogNotice client={client} now={props.now} />
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
      {/* The draft outlives a tab switch, so the composer stays mounted and hidden like a terminal. */}
      {(composerOpen || starter) && (
        <NewTaskTab
          mode={composerOpen ? "tab" : "empty"}
          active={composing || starter}
          repos={activeRepos(props.repos)}
          defaultRepoId={props.defaultRepoId}
          profiles={props.profiles}
          budget={props.budget}
          seed={props.seed}
          client={client}
          onStarted={props.onStarted}
          onAddRepo={props.onAddRepo}
        />
      )}
      {items.length === 0 && compareId === null && !loaded && (
        <Centred>
          {props.error !== null ? "The workspace did not load." : "Loading the workspace…"}
        </Centred>
      )}
      <TaskTabs
        activeId={compareId === null ? tabs.active : null}
        tasks={open}
        token={token}
        client={client}
        resumed={props.resumed}
        notices={props.notices}
        onResume={(taskId) => props.onResume(taskId, "overlay")}
        onHandoff={props.onHandoffFor}
      />
      <UsageBar
        state={props.usage}
        flash={props.flash}
        taskUsage={props.taskUsage}
        showTask={active !== undefined}
        client={client}
        refresh={props.refreshUsage}
      />
    </main>
  );
}

/** The open tabs in order, each one resolved to what it draws; an id with nothing behind it is
 * dropped until the next prune closes it. */
function tabItems(open: string[], tasks: Record<string, TaskListRow>): TabItem[] {
  const items: TabItem[] = [];
  for (const id of open) {
    if (id === NEW_TASK_TAB) {
      items.push({ kind: "new", id: NEW_TASK_TAB });
      continue;
    }
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

// Long enough for `agn daemon restart` to come back inside the feed's own retry, so a restart the
// user asked for shows nothing (handoff pick 1).
const BANNER_DELAY_MS = 3_000;

/** Whether the feed has been off for long enough to be worth saying so. */
function useDropped(connection: ConnectionState): boolean {
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    if (connection !== "reconnecting") {
      setDropped(false);
      return;
    }
    const timer = setTimeout(() => setDropped(true), BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connection]);
  return dropped;
}

export function Centred({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
      {children}
    </div>
  );
}
