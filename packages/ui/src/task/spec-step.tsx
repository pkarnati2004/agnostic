import type { Profile } from "@agnostic/core";
import type { ReactNode } from "react";
import type { ApiError } from "../api/error";
import { Button } from "../components/button";
import { FailureNotice } from "../notice/failure-notice";
import { HarnessMark } from "../profile/harness-mark";
import { profileParts } from "../profile/profile-parts";

/** The three fields a run sends beside the prompt; each one is the user's to edit or to empty. */
export type SpecDraft = { title: string; spec: string; acceptance: string };

export type SpecStepProps = {
  prompt: string;
  draft: SpecDraft;
  onChange: (draft: SpecDraft) => void;
  /** The profile that wrote it, or null while nothing has been written yet. */
  writtenBy: string | null;
  busy: boolean;
  error: ApiError | null;
  /** The profile the task will run on, which the Approve button marks. */
  profile: Profile | null;
  onBack: () => void;
  onRewrite: () => void;
  onApprove: () => void;
};

const BOX =
  "rounded-lg border border-input bg-card px-3 py-2.5 leading-[1.55] outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15";

/** The spec agn wrote, before anything runs. Both fields are editable, whoever wrote them. */
export function SpecStep(props: SpecStepProps) {
  const { draft, onChange } = props;
  return (
    <div className="flex min-w-0 flex-col gap-3.5 type-body">
      <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{props.prompt}</span>
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          Edit prompt
        </Button>
      </div>
      <Field label="Title" htmlFor="new-task-title">
        <input
          id="new-task-title"
          value={draft.title}
          onChange={(change) => onChange({ ...draft, title: change.target.value })}
          className={`${BOX} h-[34px] py-0`}
        />
      </Field>
      <Field label="Spec" htmlFor="new-task-spec">
        <textarea
          id="new-task-spec"
          value={draft.spec}
          rows={8}
          onChange={(change) => onChange({ ...draft, spec: change.target.value })}
          className={BOX}
        />
      </Field>
      <Field label="Acceptance" htmlFor="new-task-acceptance">
        <textarea
          id="new-task-acceptance"
          value={draft.acceptance}
          rows={4}
          placeholder="One criterion per line."
          onChange={(change) => onChange({ ...draft, acceptance: change.target.value })}
          className={`${BOX} placeholder:text-muted-foreground`}
        />
      </Field>
      {props.error !== null && (
        <FailureNotice error={props.error} className="rounded-lg border-b-0 px-3 py-2" />
      )}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-muted-foreground type-meta">{attribution(props)}</p>
        <Button variant="ghost" onClick={props.onBack}>
          Back
        </Button>
        <Button variant="outline" disabled={props.busy} onClick={props.onRewrite}>
          {props.busy ? "Writing…" : "Rewrite"}
        </Button>
        <Button
          disabled={props.busy || props.prompt.trim() === ""}
          onClick={props.onApprove}
          className="gap-2"
        >
          {props.profile !== null && <HarnessMark harness={props.profile.harness} />}
          Approve and start
        </Button>
      </div>
    </div>
  );
}

/** Who wrote what is on the screen, and that it is yours to change before anything runs. */
function attribution({ writtenBy }: SpecStepProps): string {
  if (writtenBy === null) {
    return "Write the spec yourself.";
  }
  // The raw profile id reads as a machine string, so the row names the harness and the model.
  const { harness, model } = profileParts(writtenBy);
  const who = model === null ? harness : `${harness} · ${model}`;
  return `Written by ${who}. Edit either field before approving.`;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-muted-foreground type-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
