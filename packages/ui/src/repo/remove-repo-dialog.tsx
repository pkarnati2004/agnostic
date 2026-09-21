import type { RepoListRow } from "@agnostic/core";
import { useState } from "react";
import { type ApiError, asApiError } from "../api/error";
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

type RemoveRepoDialogProps = {
  /** The repo the user asked to remove, or null when nothing is being removed. */
  repo: RepoListRow | null;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the daemon refused, so the answer shows in the dialog the click was in. */
  onRemove: (repoId: string) => Promise<void>;
};

/** The one click in the page that deletes directories, so it says what goes and what stays. */
export function RemoveRepoDialog({ repo, ...on }: RemoveRepoDialogProps) {
  // Keyed by repo, so a second one opens without the first's refusal or its in-flight state under it.
  return repo === null ? null : <Confirm key={repo.id} repo={repo} {...on} />;
}

type ConfirmProps = Omit<RemoveRepoDialogProps, "repo"> & { repo: RepoListRow };

function Confirm({ repo, onOpenChange, onRemove }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const remove = () => {
    setBusy(true);
    setFailure(null);
    onRemove(repo.id).then(
      () => {
        setBusy(false);
        // The row leaves the sidebar through `repo.updated`, not from here.
        onOpenChange(false);
      },
      (cause: unknown) => {
        setBusy(false);
        setFailure(asApiError(cause));
      },
    );
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {repo.name}?</DialogTitle>
          <DialogDescription>
            agn deletes the task worktrees it made for this repo, with any uncommitted work in them.
            The folder at {repo.path} is not touched.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          <HintText
            hint={`Its usage and outcome history is kept, and \`agn add ${repo.path}\` brings it back.`}
          />
        </p>
        {failure !== null && (
          <div role="alert" className="min-w-0">
            <p className="text-destructive text-sm">{failure.message}</p>
            {failure.hint !== null && (
              <p className="mt-1 text-muted-foreground text-xs">
                <HintText hint={failure.hint} />
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
          <Button size="sm" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
