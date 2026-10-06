import type { EditorId, EditorsResponse, HealthResponse } from "@agnostic/core";
import { cn } from "../class-names";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { PerRepoLine } from "./per-repo-line";
import { SettingsRow } from "./settings-row";

/** The select's value for "whichever one this machine has", which config.yaml writes as no key. */
const FIRST_FOUND = "first";

type TasksSectionProps = {
  /** `GET /health`'s `home`, which is where the worktree folder sits. */
  health: HealthResponse | null;
  /** Null while `GET /editors` has not answered. */
  editors: EditorsResponse | null;
  editor: EditorId | null;
  onEditor: (editor: EditorId | null) => void;
  /** Null until `GET /config` answers. */
  specFirst: boolean | null;
  onSpecFirst: (on: boolean) => void;
};

export function TasksSection(props: TasksSectionProps) {
  const found = props.editors?.editors ?? [];
  return (
    <>
      <div className="mt-3.5 flex flex-col">
        <SettingsRow
          label="Worktree location"
          description="Each task gets its own worktree in this folder."
        >
          <span className="text-muted-foreground type-mono">
            {worktreesPath(props.health?.home ?? null) ?? "…"}
          </span>
        </SettingsRow>
      </div>
      <PerRepoLine>
        Base branch and branch prefix are set per repo in{" "}
        <span className="type-mono">.ag/agnostic.yaml</span>.
      </PerRepoLine>
      <div className="mt-4 flex flex-col">
        <SettingsRow
          label="Write the spec first"
          description="Starting value of the toggle on new tasks."
        >
          <SpecFirstSwitch on={props.specFirst ?? false} onChange={props.onSpecFirst} />
        </SettingsRow>
        <SettingsRow
          label="Open in editor"
          description='Used by "Open in editor" in Changes and the task menu.'
        >
          <Select
            value={props.editor ?? FIRST_FOUND}
            onValueChange={(value) =>
              props.onEditor(value === FIRST_FOUND ? null : (value as EditorId))
            }
          >
            <SelectTrigger className="w-[220px]" aria-label="Open in editor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FIRST_FOUND}>
                {found[0] === undefined ? "First detected" : `First detected (${found[0].name})`}
              </SelectItem>
              {found.map((editor) => (
                <SelectItem key={editor.id} value={editor.id}>
                  {editor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
    </>
  );
}

/**
 * Mirrors `core/paths.ts`, which joins the home with `worktrees`: a change to that rule has to
 * change this line too. Null until `GET /health` answers, since the home is its field.
 */
function worktreesPath(home: string | null): string | null {
  return home === null ? null : `${home.replace(/\/$/, "")}/worktrees`;
}

function SpecFirstSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Write the spec first"
      onClick={() => onChange(!on)}
      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          "relative inline-block h-5 w-[34px] rounded-full",
          on ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-3.5 rounded-full",
            on ? "left-[17px] bg-primary-foreground" : "left-[3px] bg-muted-foreground",
          )}
        />
      </span>
    </button>
  );
}
