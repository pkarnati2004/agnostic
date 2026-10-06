import type {
  AskCommitResponse,
  ChangesResponse,
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  EditorsResponse,
  TaskListRow,
  UpdateTaskResponse,
} from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { DiffView } from "../diff/diff-view";
import { PaneHandle } from "../layout/pane-handle";
import type { PaneColumn } from "../layout/workspace-columns";
import type { TaskAction, TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "../task/task-notice-line";
import { worktreeGone } from "../task/worktree-gone";
import { ActionRow } from "./action-row";
import { ChangesHeader } from "./changes-header";
import { commitLine } from "./commit-result";
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
import { updateLine } from "./update-result";
import { type Changes, useChanges } from "./use-changes";

type ChangesPanelProps = {
  task: TaskListRow;
  client: WorkspaceClient;
  /** This task's latest failure, drawn here when the click that raised it was on this panel. */
  notice: TaskNotice | null;
  onOpen: (editor: EditorId | null) => Promise<void>;
  /** Null when the daemon refused; the dialog keeps itself open and shows the notice. */
  onCreatePr: (body: CreatePrRequest) => Promise<CreatePrResponse | null>;
  /** Null when the daemon refused, which the notice says; otherwise what the agent was asked. */
  onUpdate: () => Promise<UpdateTaskResponse | null>;
  /** Null when the daemon refused; otherwise the prompt the agent was given and how. */
  onAskCommit: () => Promise<AskCommitResponse | null>;
  /** Every read the panel finishes, so the page can offer the same actions from the palette. */
  onLoaded: (response: ChangesResponse) => void;
  /** Closes the column: the same toggle the task header's Changes button calls. */
  onClose: () => void;
  /** The page's column for this pane; absent, no handle is drawn. */
  column?: PaneColumn;
  /** Given when the command palette opened the Create PR dialog rather than its button. */
  prOpen?: boolean;
  onPrOpenChange?: (open: boolean) => void;
};

// Long enough to read the line the ask answered with, short enough not to sit in the way.
const ASK_SHOWN_MS = 8_000;

/** The third column: what the task's branch has changed, and the patch of the file selected in it. */
export function ChangesPanel(props: ChangesPanelProps) {
  const { task, client, notice, onOpen, onCreatePr, onUpdate } = props;
  const changes = useChanges(client, task, props.onLoaded);
  const editors = useEditors(client);
  const [busy, setBusy] = useState<TaskAction | null>(null);
  const [asked, showAsked] = useFading(ASK_SHOWN_MS);
  const view = panelView(changes.state);
  const cleaned = worktreeGone(task);
  const open = (editor: EditorId | null) => {
    setBusy("open");
    void onOpen(editor).finally(() => setBusy(null));
  };
  // `pushed` and the commit counts move with the push, so the header is read again after one.
  const createPr = async (body: CreatePrRequest): Promise<CreatePrResponse | null> => {
    const response = await onCreatePr(body);
    if (response !== null) {
      changes.refresh();
    }
    return response;
  };
  // The list is not re-read here: the agent works in its own time, and the status it moves to is
  // what makes the read stale.
  const update = () => {
    setBusy("update");
    void onUpdate().then((response) => {
      setBusy(null);
      if (response !== null) {
        showAsked(updateLine(response));
      }
    });
  };
  const askCommit = () => {
    setBusy("commit");
    void props.onAskCommit().then((response) => {
      setBusy(null);
      if (response !== null) {
        showAsked(commitLine(response));
      }
    });
  };

  return (
    <aside className="relative flex min-w-0 flex-col overflow-hidden border-border border-l">
      {props.column !== undefined && (
        <PaneHandle edge="left" label="Resize Changes" column={props.column} />
      )}
      <ChangesHeader
        task={task}
        response={view.kind === "changes" ? view.response : null}
        cleaned={cleaned}
        loading={changes.state.kind === "loading"}
        onRefresh={changes.refresh}
        onClose={props.onClose}
      />
      {view.kind === "changes" && (
        <ActionRow
          task={task}
          changes={view.response}
          notice={notice}
          editors={editors}
          busy={busy}
          cleaned={cleaned}
          onOpen={open}
          onCreatePr={createPr}
          onAskCommit={askCommit}
          onUpdate={update}
          prOpen={props.prOpen}
          onPrOpenChange={props.onPrOpenChange}
        />
      )}
      {notice !== null && notice.host === "panel" ? (
        <div className="px-4 py-2">
          <TaskNoticeLine notice={notice} task={task} />
        </div>
      ) : (
        asked !== null && <p className="px-4 py-2 text-muted-foreground text-sm">{asked}</p>
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

/**
 * A line the panel says once and then drops. The state is an object so that showing the same line
 * twice is a new value, which is what starts its timer again.
 */
function useFading(ms: number): [string | null, (line: string) => void] {
  const [shown, setShown] = useState<{ line: string } | null>(null);
  useEffect(() => {
    if (shown === null) {
      return;
    }
    const timer = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(timer);
  }, [shown, ms]);
  return [shown?.line ?? null, (line) => setShown({ line })];
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
