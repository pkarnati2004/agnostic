import type { BudgetReport, Profile, RepoListRow } from "@agnostic/core";
import { ArrowUp, Folder } from "lucide-react";
import { type KeyboardEvent, type RefObject, useLayoutEffect } from "react";
import { cn } from "../class-names";
import { Button } from "../components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { ProfileSelect } from "../profile/profile-select";
import { RepoAvatar } from "../repo/repo-avatar";
import { BudgetNote } from "./budget-note";
import { INTENT_OPTIONS } from "./intent-options";
import { intentLabel, type NewTaskForm } from "./new-task-request";
import type { RecommendationState } from "./use-recommendation";

// Eight lines at the design's 14 px over 1.5: past that the box scrolls instead of growing.
const MAX_HEIGHT_PX = 168;

export type ComposerProps = {
  form: NewTaskForm;
  onChange: (form: NewTaskForm) => void;
  repos: RepoListRow[];
  profiles: Profile[];
  recommendation: RecommendationState;
  /** The profile that would run: the pick until the user picks for themselves. */
  profileId: string | null;
  onPickProfile: (id: string) => void;
  writeSpec: boolean;
  onWriteSpec: (on: boolean) => void;
  /** Null until the usage bar has read one; the note under the row draws itself from it. */
  budget: BudgetReport | null;
  canStart: boolean;
  /** A run already on its way to the daemon, which the arrow reports rather than repeating. */
  busy: boolean;
  onStart: () => void;
  /** With no repo registered there is nothing to run in, so the chip opens Add a repo instead. */
  onChooseRepo: () => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  /** False while another tab is in front, where a hidden box has no height to measure. */
  active: boolean;
};

/** What the task is, and the four things about it worth saying before it starts. */
export function Composer(props: ComposerProps) {
  const { form, onChange, repos, promptRef } = props;
  const taskClass = props.recommendation.recommendation?.taskClass ?? null;
  const noRepo = repos.length === 0;
  useGrowingBox(promptRef, form.prompt, props.active);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3.5 pt-3.5 pb-2.5">
        <textarea
          id="new-task-prompt"
          ref={promptRef}
          value={form.prompt}
          rows={2}
          disabled={noRepo}
          placeholder="Describe a task. agnostic recommends a coding agent before it starts."
          onChange={(change) => onChange({ ...form, prompt: change.target.value })}
          onKeyDown={(event) => {
            if (startsNow(event)) {
              props.onStart();
            }
          }}
          className="min-h-[56px] resize-none bg-transparent text-[14px] leading-[1.5] outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {noRepo ? (
            <button
              type="button"
              onClick={props.onChooseRepo}
              className="flex h-6 items-center gap-1.5 rounded-md border border-input border-dashed px-2 text-muted-foreground type-meta hover:text-foreground"
            >
              <Folder className="size-3" />
              Choose a repo
            </button>
          ) : (
            <RepoChip repos={repos} form={form} onChange={onChange} />
          )}
          <Select
            value={form.intent}
            onValueChange={(intent) => onChange({ ...form, intent: asIntent(intent) })}
          >
            <SelectTrigger id="new-task-intent" aria-label="Intent" size="chip">
              {intentLabel(form.intent, taskClass)}
            </SelectTrigger>
            <SelectContent>
              {INTENT_OPTIONS.map((intent) => (
                <SelectItem key={intent} value={intent}>
                  {intent === "automatic" ? "auto" : intent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ProfileSelect
            id="new-task-profile"
            size="chip"
            profiles={props.profiles}
            value={form.profileId}
            recommendedId={props.recommendation.recommendation?.recommended.profileId ?? null}
            unavailable={props.recommendation.recommendation?.worthTrying ?? null}
            onChange={props.onPickProfile}
            placeholder={placeholder(props)}
          />
          <span className="flex-1" />
          <SpecSwitch on={props.writeSpec} onChange={props.onWriteSpec} />
          <Button
            size="icon"
            aria-label="Start task"
            aria-busy={props.busy}
            variant={props.canStart ? "default" : "secondary"}
            disabled={!props.canStart}
            onClick={props.onStart}
            className="size-7"
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
      <BudgetNote
        budget={props.budget}
        profile={props.profiles.find((profile) => profile.id === props.profileId) ?? null}
        ignore={form.ignoreBudget}
        onIgnore={(ignoreBudget) => onChange({ ...form, ignoreBudget })}
      />
    </div>
  );
}

/** Which repo the task runs in, with its initial, as the sidebar heading draws it. */
function RepoChip({ repos, form, onChange }: Pick<ComposerProps, "repos" | "form" | "onChange">) {
  const repo = repos.find((row) => row.id === form.repoId) ?? null;
  return (
    <Select
      value={form.repoId === "" ? undefined : form.repoId}
      onValueChange={(repoId) => onChange({ ...form, repoId })}
    >
      <SelectTrigger id="new-task-repo" aria-label="Repo" size="chip">
        {repo === null ? (
          <SelectValue placeholder="Pick a repo" />
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <RepoAvatar name={repo.name} className="size-3.5 text-[9px]" />
            {repo.name}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {repos.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {row.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Off, the arrow starts the task; on, it writes a spec first and stops for you to read it. */
function SpecSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-muted-foreground type-meta hover:text-foreground"
    >
      <span
        className={cn(
          "relative inline-block h-3.5 w-6 rounded-full",
          on ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-2.5 rounded-full",
            on ? "left-3 bg-primary-foreground" : "left-0.5 bg-muted-foreground",
          )}
        />
      </span>
      Write the spec
    </button>
  );
}

/** The box grows with the prompt and scrolls once it is eight lines tall. */
function useGrowingBox(
  promptRef: RefObject<HTMLTextAreaElement | null>,
  prompt: string,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const box = promptRef.current;
    // Measured from the text React has committed, never from the keystroke before it. A hidden box
    // measures nothing, so `active` brings the measurement back when the tab returns to the front.
    if (box === null || !active || box.value !== prompt) {
      return;
    }
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [promptRef, prompt, active]);
}

/** Following the pick is a state worth naming: the chip says so rather than repeating the id. */
function placeholder(props: ComposerProps): string {
  if (props.profiles.every((profile) => !profile.available)) {
    return "No profile is available";
  }
  return props.profileId === null ? "Profile" : "Profile: recommended";
}

/** Enter writes a newline, as it does in every other prompt box; Cmd or Ctrl with it starts. */
function startsNow(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
    return false;
  }
  event.preventDefault();
  return true;
}

/** The select hands back a string; the options it was given are the intents. */
function asIntent(value: string): NewTaskForm["intent"] {
  return INTENT_OPTIONS.find((intent) => intent === value) ?? "automatic";
}
