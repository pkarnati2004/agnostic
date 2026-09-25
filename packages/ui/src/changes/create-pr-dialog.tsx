import type {
  ChangesResponse,
  CreatePrRequest,
  CreatePrResponse,
  TaskListRow,
} from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/dialog";
import type { TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "../task/task-notice-line";
import { type PrOutcome, prOutcome } from "./pr-result";

type CreatePrDialogProps = {
  task: TaskListRow;
  changes: ChangesResponse;
  /** This task's latest failure, drawn here when the click that raised it was in this dialog. */
  notice: TaskNotice | null;
  disabled: boolean;
  /** Null when the daemon refused: the dialog stays open with the notice in it. */
  onSubmit: (body: CreatePrRequest) => Promise<CreatePrResponse | null>;
  /** Given when something other than the trigger opens the dialog, as the command palette does. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type Opened = { outcome: PrOutcome; url: string; body: string };

/**
 * What agn is about to do to the remote, before it does it: one push to origin, then the pull
 * request. Everything but the title is shown to be read, not changed (ADR 036 Q5).
 */
export function CreatePrDialog({ disabled, ...props }: CreatePrDialogProps) {
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = (next: boolean) => {
    setOwn(next);
    props.onOpenChange?.(next);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          Create PR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Confirm {...props} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type ConfirmProps = Omit<CreatePrDialogProps, "disabled" | "open" | "onOpenChange"> & {
  onClose: () => void;
};

function Confirm({ task, changes, notice, onSubmit, onClose }: ConfirmProps) {
  const [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);

  const submit = () => {
    // Opened on the click itself: a tab opened after an await is what a popup blocker eats.
    const tab = window.open("", "_blank");
    setBusy(true);
    void onSubmit({ title: title.trim() }).then(async (response) => {
      setBusy(false);
      if (response === null) {
        tab?.close();
        return;
      }
      if (tab !== null) {
        tab.location.href = response.url;
      }
      const copied = await writeClipboard(response.body);
      setOpened({ outcome: prOutcome(response, copied), url: response.url, body: response.body });
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create pull request</DialogTitle>
        <DialogDescription>
          agn pushes this branch to origin once. It never force-pushes and never touches another
          remote.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {opened === null ? (
          <Fields task={task} changes={changes} title={title} onTitle={setTitle} />
        ) : (
          <Opening opened={opened} />
        )}
        {notice !== null && notice.host === "dialog" && (
          <TaskNoticeLine notice={notice} task={task} />
        )}
      </DialogBody>
      <DialogFooter>
        {opened === null ? (
          <>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={submit} disabled={busy || title.trim() === ""}>
              Push and create PR
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

type FieldsProps = {
  task: TaskListRow;
  changes: ChangesResponse;
  title: string;
  onTitle: (title: string) => void;
};

function Fields({ task, changes, title, onTitle }: FieldsProps) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Row label="Remote" value={changes.remote ?? ""} />
      <Row label="Branch" value={task.branch ?? ""} />
      <Row label="Base" value={changes.base.ref} />
      <label className="flex flex-col gap-2" htmlFor="pr-title">
        Title
        <input
          id="pr-title"
          value={title}
          onChange={(change) => onTitle(change.target.value)}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      {changes.uncommitted > 0 && (
        <p className="text-muted-foreground text-xs">
          {changes.uncommitted} uncommitted changes stay in the worktree; only commits are pushed.
        </p>
      )}
      {(changes.behind ?? 0) > 0 && (
        <p className="text-muted-foreground text-xs">
          The branch is behind {changes.base.ref} by {changes.behind} commits.
        </p>
      )}
    </div>
  );
}

function Opening({ opened }: { opened: Opened }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      <p>{opened.outcome.line}</p>
      <p className="text-muted-foreground text-xs">{opened.outcome.detail}</p>
      <a href={opened.url} target="_blank" rel="noreferrer" className="truncate underline">
        {opened.url}
      </a>
      <pre className="max-h-48 overflow-auto rounded-md border border-border p-2 text-xs">
        {opened.body}
      </pre>
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void writeClipboard(opened.body);
          }}
        >
          Copy description
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs leading-5">{value}</span>
    </div>
  );
}

/** The browser can refuse a clipboard write; the description is on screen either way. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
