import type { HandoffTaskRequest, Profile, RepoListRow, Task } from "@agnostic/core";
import { useEffect, useMemo, useState } from "react";
import { createClient, type WorkspaceClient } from "./api/client";
import type { ApiError } from "./api/error";
import { browserTokenSources, readToken } from "./auth/token";
import { cn } from "./class-names";
import { TooltipProvider } from "./components/tooltip";
import { Notice } from "./notice";
import { groupTasks } from "./sidebar/group-tasks";
import { Sidebar } from "./sidebar/sidebar";
import { useWorkspace } from "./store/use-workspace";
import { TaskHeader } from "./task/task-header";

const SELECTED_KEY = "agn.selected";

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
  const { state, error, act } = useWorkspace(client);
  const profiles = useProfiles(client);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_KEY));
  const groups = useMemo(
    () => groupTasks(state.repos, Object.values(state.tasks)),
    [state.repos, state.tasks],
  );
  const selected = selectedId === null ? undefined : state.tasks[selectedId];

  const select = (id: string) => {
    localStorage.setItem(SELECTED_KEY, id);
    setSelectedId(id);
  };
  const handoff = async (body: HandoffTaskRequest) => {
    if (selected === undefined) {
      return;
    }
    await act(async (api) => {
      const { task } = await api.handoffTask(selected.id, body);
      select(task.id);
      return task;
    });
  };

  return (
    <div
      className={cn("grid h-full", collapsed ? "grid-cols-[52px_1fr]" : "grid-cols-[240px_1fr]")}
    >
      <Sidebar
        groups={groups}
        selectedId={selectedId}
        collapsed={collapsed}
        onSelect={select}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <main className="flex min-w-[640px] flex-col overflow-hidden">
        {selected !== undefined && (
          <TaskHeader
            task={selected}
            repo={repoOf(state.repos, selected)}
            profiles={profiles}
            onStop={() => act((api) => api.stopTask(selected.id).then((body) => body.task))}
            onResume={() => act((api) => api.resumeTask(selected.id).then((body) => body.task))}
            onHandoff={handoff}
          />
        )}
        {/* A failure before the first snapshot has no header to sit under, so the notice is outside it. */}
        <Notice error={error === dismissed ? null : error} onDismiss={() => setDismissed(error)} />
        <Centred>
          {selected === undefined
            ? emptyCentre(state.loaded, error !== null)
            : "Terminal not available yet."}
        </Centred>
      </main>
    </div>
  );
}

/** With nothing selected the centre says where the page got to; the notice above it says why. */
function emptyCentre(loaded: boolean, failed: boolean): string {
  if (loaded) {
    return "Select a task.";
  }
  return failed ? "The workspace did not load." : "Loading the workspace…";
}

/** The profile list changes only when the daemon re-detects, so the page reads it once. */
function useProfiles(client: WorkspaceClient): Profile[] {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    let live = true;
    // A list the page could not read leaves the handoff dialog with nothing to pick, which it says.
    const apply = (found: Profile[]) => {
      if (live) {
        setProfiles(found);
      }
    };
    void client.profiles().then(
      (response) => apply(response.profiles),
      () => apply([]),
    );
    return () => {
      live = false;
    };
  }, [client]);
  return profiles;
}

function repoOf(repos: RepoListRow[], task: Task): RepoListRow | null {
  return repos.find((repo) => repo.id === task.repoId) ?? null;
}

function Centred({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
      {children}
    </div>
  );
}
