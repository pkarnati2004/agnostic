import type { BudgetReport, HandoffTaskRequest, Profile, Task } from "@agnostic/core";
import { ArrowRight, ArrowRightLeft, GitFork } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { ProfileChip } from "../profile/profile-chip";
import { profileParts } from "../profile/profile-parts";
import type { TaskNotice } from "../store/task-notices";
import { BudgetNote } from "./budget-note";
import { TaskNoticeLine } from "./task-notice-line";

type HandoffDialogProps = {
  task: Task;
  profiles: Profile[];
  /** The machine's spend against config.yaml's ceilings, null until the usage bar has read one. */
  budget: BudgetReport | null;
  /** This task's latest failure, drawn in the dialog when that is where it was asked for. */
  notice: TaskNotice | null;
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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ignoreBudget, setIgnoreBudget] = useState(false);
  const [busy, setBusy] = useState(false);
  const available = profiles.filter((profile) => profile.available);

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
      setProfileId(null);
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
          <Profiles task={task} available={available} profileId={profileId} onPick={setProfileId} />
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

type ProfilesProps = {
  task: Task;
  available: Profile[];
  profileId: string | null;
  onPick: (profileId: string) => void;
};

/** Which agent has the task now, and which one gets it. The recommendation for the task's prompt
 * lands between the two in a later pass. */
function Profiles({ task, available, profileId, onPick }: ProfilesProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-[30px] items-center rounded-[7px] border border-border px-2.5 text-muted-foreground">
        <ProfileChip profileId={task.profileId} variant="option" dim />
      </span>
      <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <Select value={profileId ?? undefined} onValueChange={onPick}>
        <SelectTrigger id="handoff-profile" aria-label="Profile" mono>
          <SelectValue placeholder="Pick a profile" />
        </SelectTrigger>
        <SelectContent>
          {available.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              <ProfileChip profileId={profile.id} billing={profile.billing} variant="option" />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** What the handoff leaves behind: a second task on the same branch, and this session stopped. */
function ChildLine({ branch }: { branch: string | null }) {
  return (
    <p className="flex gap-2 text-muted-foreground type-meta">
      <GitFork aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {branch === null ? (
          "Starts a child task in the same folder."
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
