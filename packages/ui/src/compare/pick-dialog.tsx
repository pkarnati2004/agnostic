import type { CompareTaskRow } from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";

type PickDialogProps = {
  row: CompareTaskRow;
  /** How many siblings the pick stops and cleans, which is every other one. */
  others: number;
  onConfirm: () => Promise<void>;
};

/** What agn is about to do to the other agents, before it does it: a pick removes worktrees. */
export function PickDialog({ row, others, onConfirm }: PickDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirm = () => {
    setBusy(true);
    void onConfirm().finally(() => setBusy(false));
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{`Keep ${row.profileId}?`}</DialogTitle>
        <DialogDescription>{stopping(others)}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
        <Button size="sm" onClick={confirm} disabled={busy}>
          Pick
        </Button>
      </DialogFooter>
    </>
  );
}

/** The count is the point: it says how much of the compare this click throws away. */
function stopping(others: number): string {
  if (others === 1) {
    return "The other 1 agent is stopped and its worktree removed. Its branch stays, so nothing committed is lost.";
  }
  return `The other ${others} agents are stopped and their worktrees removed. Their branches stay, so nothing committed is lost.`;
}
