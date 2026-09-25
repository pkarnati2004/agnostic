import type { BudgetReport, HandoffTaskRequest, Profile, Task } from "@agnostic/core";
import { ArrowRight, ArrowRightLeft, GitFork } from "lucide-react";
import { useState } from "react";
import type { WorkspaceClient } from "../api/client";
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
import { ProfileChip } from "../profile/profile-chip";
import { profileParts } from "../profile/profile-parts";
import { ProfileSelect } from "../profile/profile-select";
import type { TaskNotice } from "../store/task-notices";
import { BudgetNote } from "./budget-note";
import { followRecommendation } from "./new-task-request";
import { RecommendationCard } from "./recommendation-card";
import { TaskNoticeLine } from "./task-notice-line";
import { useRecommendation } from "./use-recommendation";

type HandoffDialogProps = {
  task: Task;
  profiles: Profile[];
  /** The machine's spend against config.yaml's ceilings, null until the usage bar has read one. */
  budget: BudgetReport | null;
  /** This task's latest failure, drawn in the dialog when that is where it was asked for. */
  notice: TaskNotice | null;
  /** Asks agn who should take the task next, for the prompt the task already has. */
  client: WorkspaceClient;
  /** False when the daemon refused: the dialog stays open where the profile can be changed. */
  onSubmit: (body: HandoffTaskRequest) => Promise<boolean>;
  /** Given when something other than the trigger opens the dialog, as the command palette does. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Hands the task to another profile. The child starts from the note; the parent is stopped. */
export function HandoffDialog(props: HandoffDialogProps) {
  const { task, profiles, budget, notice, onSubmit } = props;
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = (next: boolean) => {
    setOwn(next);
    props.onOpenChange?.(next);
  };
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ignoreBudget, setIgnoreBudget] = useState(false);
  const [busy, setBusy] = useState(false);
  const available = profiles.filter((profile) => profile.available);
  // The card is about this task's own prompt, so it is asked for once the dialog is open, and the
  // call is a dry run: the handoff itself records the recommendation the child starts on.
  const state = useRecommendation(
    props.client,
    open ? { repoId: task.repoId, prompt: task.prompt, dryRun: true } : null,
  );
  const profileId = followRecommendation(picked, picked !== null, state.recommendation, available);

  const submit = () => {
    if (profileId === null) {
      return;
    }
    const trimmed = note.trim();
    setBusy(true);
    void onSubmit({
      profile: profileId,
      ...(trimmed === "" ? {} : { note: trimmed }),
      ...(ignoreBudget ? { ignoreBudget: true } : {}),
    }).then((sent) => {
      setBusy(false);
      if (!sent) {
        return;
      }
      setOpen(false);
      setPicked(null);
      setNote("");
      setIgnoreBudget(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <ArrowRightLeft />
          Hand off
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand off</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-[30px] items-center rounded-[7px] border border-border px-2.5 text-muted-foreground">
              <ProfileChip profileId={task.profileId} variant="option" dim />
            </span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <ProfileSelect
                id="handoff-profile"
                profiles={profiles}
                value={profileId}
                recommendedId={state.recommendation?.recommended.profileId ?? null}
                unavailable={state.recommendation?.worthTrying ?? null}
                onChange={setPicked}
                placeholder="Pick a profile"
              />
            </span>
          </div>
          <RecommendationCard state={state} profiles={profiles} compact />
          <BudgetNote
            budget={budget}
            profile={available.find((profile) => profile.id === profileId) ?? null}
            ignore={ignoreBudget}
            onIgnore={setIgnoreBudget}
          />
          {available.length === 0 && (
            <p className="text-muted-foreground type-meta">
              No profile is available. Run `agn doctor` to see what this machine has.
            </p>
          )}
          <label className="flex flex-col gap-1.5 type-meta" htmlFor="handoff-note">
            Note for the next agent
            <textarea
              id="handoff-note"
              value={note}
              onChange={(change) => setNote(change.target.value)}
              rows={4}
              className="rounded-[7px] border border-input bg-transparent px-3 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
            />
          </label>
          <ChildLine branch={task.branch} />
          {notice !== null && notice.host === "dialog" && (
            <TaskNoticeLine notice={notice} task={task} />
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={profileId === null || busy}>
            <ArrowRightLeft />
            {profileId === null ? "Hand off" : `Hand off to ${profileParts(profileId).harness}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the handoff leaves behind: a second task on the same branch, and this session stopped. */
function ChildLine({ branch }: { branch: string | null }) {
  return (
    <p className="flex gap-2 text-muted-foreground type-meta">
      <GitFork aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {branch === null ? (
          "Starts a child task in the repo checkout."
        ) : (
          <>
            Starts a child task in the same worktree, <span className="type-mono">{branch}</span>.
          </>
        )}{" "}
        The current session stops when the new one starts.
      </span>
    </p>
  );
}
