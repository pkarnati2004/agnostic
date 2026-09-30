import { useEffect } from "react";
import type { WorkspaceState } from "../store/workspace-state";
import { type TabsAction, type TabsState, tabbableTasks, writeTabs } from "./tabs-state";

/**
 * The tab list outlives the page; a task that has been cleaned takes its tab with it, and so does a
 * repo that has been removed. The repo comes from state, not from the click, so `agn repo remove`
 * run elsewhere closes the tabs on its `repo.updated` event too.
 */
export function useTabsStorage(
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
