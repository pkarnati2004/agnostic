import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import { Button } from "../components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";
import { HintText } from "../hint-text";
import {
  type AddRepoForm,
  type AddResult,
  addResult,
  type Failure,
  pathProblem,
  registerRequest,
} from "./add-repo-request";

type AddRepoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: WorkspaceClient;
  /** Rejects when the daemon refused, so the answer shows where the click was. */
  onReopen: (repoId: string) => Promise<void>;
};

const FIELD =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Point agn at a folder on this machine. The row arrives through the feed, not from here. */
export function AddRepoDialog(props: AddRepoDialogProps) {
  const field = useRef<HTMLInputElement>(null);
  const add = useAddRepo(props);
  const { form } = add;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent onOpenAutoFocus={focusPath(field)}>
        <DialogHeader>
          <DialogTitle>Add repo</DialogTitle>
          <DialogDescription>
            Point agn at a repo or a folder already on this machine.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm" htmlFor="add-repo-path">
          Path
          <input
            id="add-repo-path"
            ref={field}
            required
            value={form.path}
            placeholder="/Users/you/code/petal"
            onChange={(change) => add.setForm({ ...form, path: change.target.value })}
            onKeyDown={addsNow(add.submit)}
            className={FIELD}
          />
        </label>
        <label className="flex items-start gap-2 text-sm" htmlFor="add-repo-git-init">
          <input
            id="add-repo-git-init"
            type="checkbox"
            checked={form.gitInit}
            onChange={(change) => add.setForm({ ...form, gitInit: change.target.checked })}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            Run git init first
            <span className="mt-1 block text-muted-foreground text-xs">
              A folder with no .git is registered as a folder repo; tasks run in it in place.
            </span>
          </span>
        </label>
        {add.known !== null && (
          <KnownRepo result={add.known} busy={add.busy} onReopen={add.reopen} />
        )}
        {add.failure !== null && (
          <div role="alert" className="min-w-0">
            <p className="text-destructive text-sm">{add.failure.message}</p>
            {add.failure.hint !== null && (
              <p className="mt-1 text-muted-foreground text-xs">
                <HintText hint={add.failure.hint} />
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={add.submit}
            disabled={registerRequest(form) === null || add.busy}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** agn had this path already. A closed repo is the one case the dialog can put right itself. */
function KnownRepo({
  result,
  busy,
  onReopen,
}: {
  result: AddResult;
  busy: boolean;
  onReopen: (repoId: string) => void;
}) {
  const closed = result.kind === "closed";
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 text-muted-foreground text-sm">
        {result.repo.name} is already registered.
        {closed && " It is closed, so it is not in the list."}
      </p>
      {closed && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onReopen(result.repo.id)}>
          Reopen
        </Button>
      )}
    </div>
  );
}

const BLANK: AddRepoForm = { path: "", gitInit: false };

/** Every open starts from an empty field, and every answer replaces the one before it. */
function useAddRepo(props: AddRepoDialogProps) {
  const [form, setForm] = useState<AddRepoForm>(BLANK);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [known, setKnown] = useState<AddResult | null>(null);
  useEffect(() => {
    if (props.open) {
      setForm(BLANK);
      setBusy(false);
      setFailure(null);
      setKnown(null);
    }
  }, [props.open]);

  const submit = () => {
    const body = registerRequest(form);
    if (body === null || busy) {
      return;
    }
    setKnown(null);
    const problem = pathProblem(form.path);
    if (problem !== null) {
      // The browser can answer this one itself, so the daemon is not asked.
      setFailure(problem);
      return;
    }
    setFailure(null);
    setBusy(true);
    props.client.registerRepo(body).then(
      (response) => {
        setBusy(false);
        const result = addResult(response);
        // The row arrives through `repo.registered`, which the store already upserts.
        if (result.kind === "added") {
          props.onOpenChange(false);
          return;
        }
        setKnown(result);
      },
      (cause: unknown) => {
        setBusy(false);
        setFailure(asApiError(cause));
      },
    );
  };

  const reopen = (repoId: string) => {
    setBusy(true);
    props.onReopen(repoId).then(
      () => {
        setBusy(false);
        props.onOpenChange(false);
      },
      (cause: unknown) => {
        setBusy(false);
        setFailure(asApiError(cause));
      },
    );
  };

  return { form, setForm, busy, failure, known, submit, reopen };
}

/** The path is what the dialog is for, so it takes the focus rather than the Cancel button. */
function focusPath(field: RefObject<HTMLInputElement | null>) {
  return (event: Event) => {
    event.preventDefault();
    field.current?.focus({ preventScroll: true });
  };
}

/** One line of text, so Enter adds; the new-task dialog needs Cmd+Enter only for its textarea. */
function addsNow(submit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };
}
