import type { EditorId, EditorsResponse, TaskListRow } from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { DiffView } from "../diff/diff-view";
import type { TaskAction, TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "../task/task-notice-line";
import { ActionRow } from "./action-row";
import { ChangesHeader } from "./changes-header";
import { FileList } from "./file-list";
import {
  EmptyLine,
  FailedLine,
  FolderLine,
  LoadingLine,
  LoadingPatch,
  type PanelView,
  panelView,
} from "./panel-state";
import { type Changes, useChanges } from "./use-changes";

type ChangesPanelProps = {
  task: TaskListRow;
  client: WorkspaceClient;
  /** This task's latest failure, drawn here when the click that raised it was on this panel. */
  notice: TaskNotice | null;
  onOpen: (editor: EditorId | null) => Promise<void>;
};

/** The third column: what the task's branch has changed, and the patch of the file selected in it. */
export function ChangesPanel({ task, client, notice, onOpen }: ChangesPanelProps) {
  const changes = useChanges(client, task);
  const editors = useEditors(client);
  const [busy, setBusy] = useState<TaskAction | null>(null);
  const view = panelView(changes.state);
  const cleaned = !task.worktreePresent && task.worktreePath !== null;
  const open = (editor: EditorId | null) => {
    setBusy("open");
    void onOpen(editor).finally(() => setBusy(null));
  };

  return (
    <aside className="flex min-w-0 flex-col overflow-hidden border-border border-l">
      {view.kind === "changes" && (
        <ChangesHeader task={task} response={view.response} cleaned={cleaned} />
      )}
      {(view.kind === "changes" || view.kind === "failed") && (
        <ActionRow
          editors={editors}
          busy={busy}
          cleaned={cleaned}
          refreshOnly={view.kind === "failed"}
          loading={changes.state.kind === "loading"}
          onOpen={open}
          onRefresh={changes.refresh}
        />
      )}
      {notice !== null && notice.host === "panel" && (
        <div className="px-4 py-2">
          <TaskNoticeLine notice={notice} task={task} />
        </div>
      )}
      <PanelBody view={view} changes={changes} />
    </aside>
  );
}

function PanelBody({ view, changes }: { view: PanelView; changes: Changes }) {
  switch (view.kind) {
    case "loading":
      return <LoadingLine />;
    case "folder":
      return <FolderLine error={view.error} />;
    case "failed":
      return <FailedLine error={view.error} />;
    case "changes":
      return view.response.files.length === 0 ? (
        <EmptyLine base={view.response.base.ref} />
      ) : (
        <>
          <FileList
            files={view.response.files}
            selected={changes.selected}
            onSelect={changes.select}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <Patch changes={changes} />
          </div>
        </>
      );
  }
}

function Patch({ changes }: { changes: Changes }) {
  const { patch, selected } = changes;
  if (patch === null || patch.path !== selected) {
    return <LoadingPatch />;
  }
  if ("error" in patch) {
    return <FailedLine error={patch.error} />;
  }
  return <DiffView patch={patch.patch} path={patch.path} />;
}

/** The editors are the machine's, not the task's, so the panel reads them once. A failed read
 * leaves the control disabled, which is what it looks like on a machine with no editor. */
function useEditors(client: WorkspaceClient): EditorsResponse | null {
  const [editors, setEditors] = useState<EditorsResponse | null>(null);
  useEffect(() => {
    let live = true;
    void client.editors().then(
      (response) => {
        if (live) {
          setEditors(response);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);
  return editors;
}
