import type { Task } from "@agnostic/core";
import type { WorkspaceClient } from "../api/client";
import type { TaskNotices } from "../store/task-notices";
import { TerminalView } from "../terminal/terminal-view";
import type { ResumeNotice } from "./resume-notice";
import type { TabsState } from "./tabs-state";

type TaskTabsProps = {
  state: TabsState;
  /** Every open tab's task, in tab order. */
  tasks: Task[];
  token: string;
  client: WorkspaceClient;
  /** The last resume's answer, for whichever tab it was; only that tab shows it. */
  resumed: ResumeNotice | null;
  /** Keyed by task: every tab is mounted, so each one draws only its own failure. */
  notices: TaskNotices;
  onResume: (taskId: string) => Promise<void>;
};

/** Every open tab stays mounted: a hidden one keeps its scrollback and its tmux client. */
export function TaskTabs(props: TaskTabsProps) {
  const { state, tasks, token, client, resumed, notices, onResume } = props;
  if (tasks.length === 0) {
    return null;
  }
  return (
    <>
      {tasks.map((task) => (
        <TerminalView
          key={task.id}
          task={task}
          token={token}
          client={client}
          active={task.id === state.active}
          resumeNotice={resumed?.taskId === task.id ? resumed.notice : null}
          failure={notices[task.id] ?? null}
          onResume={() => onResume(task.id)}
        />
      ))}
    </>
  );
}
