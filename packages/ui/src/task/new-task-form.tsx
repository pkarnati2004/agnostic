import type { BudgetReport, Profile, RepoListRow } from "@agnostic/core";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { BudgetNote } from "./budget-note";
import { INTENT_OPTIONS } from "./intent-options";
import type { NewTaskForm } from "./new-task-request";
import { RecommendationCard } from "./recommendation-card";
import type { RecommendationState } from "./use-recommendation";

type NewTaskFieldsProps = {
  repos: RepoListRow[];
  profiles: Profile[];
  /** Null until the usage bar has read one; the note under the select draws itself from it. */
  budget: BudgetReport | null;
  form: NewTaskForm;
  onChange: (form: NewTaskForm) => void;
  /** Null until a profile is picked or the recommendation supplies one. */
  profileId: string | null;
  onPickProfile: (profileId: string) => void;
  state: RecommendationState;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onRunShortcut: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/** Repo, prompt, intent, the card, and the profile that will be run. */
export function NewTaskFields(props: NewTaskFieldsProps) {
  const { form, onChange, profiles, state } = props;
  return (
    <>
      <Field label="Repo" htmlFor="new-task-repo">
        <Picker
          id="new-task-repo"
          value={form.repoId === "" ? null : form.repoId}
          placeholder="Pick a repo"
          options={props.repos.map((repo) => ({ value: repo.id, label: repo.name }))}
          onChange={(repoId) => onChange({ ...form, repoId })}
        />
      </Field>
      <Field label="What should the agent do?" htmlFor="new-task-prompt">
        <textarea
          id="new-task-prompt"
          ref={props.promptRef}
          value={form.prompt}
          rows={6}
          onChange={(change) => onChange({ ...form, prompt: change.target.value })}
          onKeyDown={props.onRunShortcut}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </Field>
      <Field label="Intent" htmlFor="new-task-intent">
        <Picker
          id="new-task-intent"
          value={form.intent}
          placeholder="automatic"
          options={INTENT_OPTIONS.map((intent) => ({ value: intent, label: intent }))}
          onChange={(intent) => onChange({ ...form, intent: asIntent(intent) })}
        />
      </Field>
      <RecommendationCard state={state} />
      <Field label="Profile" htmlFor="new-task-profile">
        <Picker
          id="new-task-profile"
          value={props.profileId}
          placeholder={profiles.length === 0 ? "No profile is available" : "Pick a profile"}
          options={profiles.map((profile) => ({ value: profile.id, label: profile.id }))}
          onChange={props.onPickProfile}
        />
        <p className="text-muted-foreground text-xs">{pickNote(state, props.profileId)}</p>
        <BudgetNote
          budget={props.budget}
          profile={profiles.find((profile) => profile.id === props.profileId) ?? null}
          ignore={form.ignoreBudget}
          onIgnore={(ignoreBudget) => onChange({ ...form, ignoreBudget })}
        />
      </Field>
    </>
  );
}

/** What agn said about the profile now selected, or what it would have picked instead. */
function pickNote(state: RecommendationState, profileId: string | null): string | null {
  const pick = state.recommendation?.recommended;
  if (pick === undefined) {
    return null;
  }
  return pick.profileId === profileId
    ? `agn's pick: ${pick.reason}`
    : `agn picked ${pick.profileId}`;
}

/** The select hands back a string; the options it was given are the intents. */
function asIntent(value: string): NewTaskForm["intent"] {
  return INTENT_OPTIONS.find((intent) => intent === value) ?? "automatic";
}

/** One labelled control, the shape of every field in this dialog. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

type PickerProps = {
  id: string;
  value: string | null;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

/** One list of values with no free text, which is every select in this dialog. */
function Picker({ id, value, placeholder, options, onChange }: PickerProps) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
