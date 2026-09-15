import type { ApiError } from "../api/error";
import { Button } from "../components/button";
import { DialogClose, DialogFooter } from "../components/dialog";
import type { SpecWriter } from "./use-spec-writer";

type NewTaskFooterProps = {
  /** What the run failed with; what the spec writer failed with sits under its own button. */
  error: ApiError | null;
  /** The repo's test command while it runs, which is what a slow start is waiting on (ADR 022). */
  testing: string | null;
  runDisabled: boolean;
  onRun: () => void;
  writer: SpecWriter;
  /** Null while there is no prompt or no repo to write a spec from. */
  onWriteSpec: (() => void) | null;
};

export function NewTaskFooter(props: NewTaskFooterProps) {
  const { writer, onWriteSpec } = props;
  return (
    <div className="flex flex-col gap-3">
      <Failure error={props.error} />
      {props.testing !== null && (
        <p className="text-muted-foreground text-xs">Running the tests first: {props.testing}</p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
        </DialogClose>
        {!writer.shown && (
          <Button variant="ghost" size="sm" onClick={writer.show}>
            Write it yourself
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onWriteSpec?.()}
          disabled={onWriteSpec === null || writer.busy}
        >
          {writer.busy ? "Writing…" : "Write spec"}
        </Button>
        <Button size="sm" onClick={props.onRun} disabled={props.runDisabled}>
          Run
        </Button>
      </DialogFooter>
      {/* The spec is optional, so its failure reads as a note under the button, not as a blocker. */}
      <Failure error={writer.error} />
    </div>
  );
}

function Failure({ error }: { error: ApiError | null }) {
  if (error === null) {
    return null;
  }
  return (
    <div>
      <p className="text-destructive text-sm">{error.message}</p>
      {error.hint !== null && <p className="mt-1 text-muted-foreground text-xs">{error.hint}</p>}
    </div>
  );
}
