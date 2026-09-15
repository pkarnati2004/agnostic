import { Field } from "./new-task-form";

/** The three fields Run sends beside the prompt; each one is the user's to edit or to empty. */
export type SpecDraft = {
  title: string;
  spec: string;
  acceptance: string;
};

type SpecFieldsProps = {
  draft: SpecDraft;
  onChange: (draft: SpecDraft) => void;
  /** The profile that wrote it, or null when the user opened the fields to write one. */
  writtenBy: string | null;
};

const BOX =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SpecFields({ draft, onChange, writtenBy }: SpecFieldsProps) {
  return (
    <>
      <Field label="Title" htmlFor="new-task-title">
        <input
          id="new-task-title"
          value={draft.title}
          onChange={(change) => onChange({ ...draft, title: change.target.value })}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {writtenBy !== null && (
          <p className="text-muted-foreground text-xs">written by {writtenBy}</p>
        )}
      </Field>
      <Field label="Spec" htmlFor="new-task-spec">
        <textarea
          id="new-task-spec"
          value={draft.spec}
          rows={10}
          onChange={(change) => onChange({ ...draft, spec: change.target.value })}
          className={`${BOX} font-mono`}
        />
      </Field>
      <Field label="Acceptance" htmlFor="new-task-acceptance">
        <textarea
          id="new-task-acceptance"
          value={draft.acceptance}
          rows={6}
          onChange={(change) => onChange({ ...draft, acceptance: change.target.value })}
          className={`${BOX} font-mono`}
        />
      </Field>
    </>
  );
}
