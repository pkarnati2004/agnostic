import type { HealthResponse, MachineConfig, Profile, RepoListRow } from "@agnostic/core";
import type { WorkspaceClient } from "./api/client";
import { AddRepoDialog } from "./repo/add-repo-dialog";
import { RemoveRepoDialog } from "./repo/remove-repo-dialog";
import type { RepoActions } from "./repo/use-repo-actions";
import { SettingsDialog } from "./settings/settings-dialog";
import type { WorkspaceState } from "./store/workspace-state";
import type { AppearanceRoot } from "./styles/appearance-root";
import { DeleteTaskDialog } from "./task/delete-task-dialog";
import type { RowActionsState } from "./task/use-row-actions";

type WorkspaceDialogsProps = {
  client: WorkspaceClient;
  /** The repo list the Delete confirmation names the task's repo from, and the daemon's state. */
  state: WorkspaceState;
  rows: RowActionsState;
  repoActions: RepoActions;
  root: AppearanceRoot;
  health: HealthResponse | null;
  /** The page's profile list, which the Settings dialog's Agents section draws read-only. */
  profiles: Profile[];
  /** Every config answer the dialog gets, so the page's own copy follows a change. */
  onConfig: (config: MachineConfig) => void;
  addRepo: boolean;
  onAddRepoChange: (open: boolean) => void;
  /** The repo the Remove confirmation is about, or null while it is closed. */
  removing: RepoListRow | null;
  onRemovingChange: (open: boolean) => void;
  settings: boolean;
  onSettingsChange: (open: boolean) => void;
};

/** Every dialog the page owns, in one place, so `app.tsx` holds the state and not the markup. */
export function WorkspaceDialogs(props: WorkspaceDialogsProps) {
  const { rows, state } = props;
  return (
    <>
      <AddRepoDialog
        open={props.addRepo}
        onOpenChange={props.onAddRepoChange}
        client={props.client}
        onReopen={props.repoActions.reopen}
      />
      <RemoveRepoDialog
        repo={props.removing}
        onOpenChange={props.onRemovingChange}
        onRemove={props.repoActions.remove}
      />
      <DeleteTaskDialog
        task={rows.deleting}
        repo={state.repos.find((repo) => repo.id === rows.deleting?.repoId) ?? null}
        client={props.client}
        onOpenChange={rows.closeDelete}
        onDelete={rows.onDelete}
      />
      <SettingsDialog
        open={props.settings}
        onOpenChange={props.onSettingsChange}
        client={props.client}
        root={props.root}
        health={props.health}
        connection={state.connection}
        profiles={props.profiles}
        onConfig={props.onConfig}
      />
    </>
  );
}
