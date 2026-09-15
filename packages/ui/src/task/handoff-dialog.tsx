import type { HandoffTaskRequest, Profile, Task } from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import {
  Dialog,
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
import type { TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "./task-notice-line";

type HandoffDialogProps = {
  task: Task;
  profiles: Profile[];
  /** This task's latest failure, drawn in the dialog when that is where it was asked for. */
  notice: TaskNotice | null;
  /** False when the daemon refused: the dialog stays open where the profile can be changed. */
  onSubmit: (body: HandoffTaskRequest) => Promise<boolean>;
};

/** Hands the task to another profile. The child starts from the note; the parent is stopped. */
export function HandoffDialog({ task, profiles, notice, onSubmit }: HandoffDialogProps) {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const available = profiles.filter((profile) => profile.available);

  const submit = () => {
    if (profileId === null) {
      return;
    }
    const trimmed = note.trim();
    setBusy(true);
    void onSubmit({ profile: profileId, ...(trimmed === "" ? {} : { note: trimmed }) }).then(
      (sent) => {
        setBusy(false);
        if (!sent) {
          return;
        }
        setOpen(false);
        setProfileId(null);
        setNote("");
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Hand off
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand off {task.title}</DialogTitle>
          <DialogDescription>
            The task stops here and a new one starts from your note.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-sm" htmlFor="handoff-profile">
          Profile
          <Select value={profileId ?? undefined} onValueChange={setProfileId}>
            <SelectTrigger id="handoff-profile">
              <SelectValue placeholder="Pick a profile" />
            </SelectTrigger>
            <SelectContent>
              {available.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {available.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No profile is available. Run `agn doctor` to see what this machine has.
          </p>
        )}
        <label className="flex flex-col gap-2 text-sm" htmlFor="handoff-note">
          Note (optional)
          <textarea
            id="handoff-note"
            value={note}
            onChange={(change) => setNote(change.target.value)}
            rows={4}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        {notice !== null && notice.host === "dialog" && (
          <TaskNoticeLine notice={notice} task={task} />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={submit} disabled={profileId === null || busy}>
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
