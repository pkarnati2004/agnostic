import type { ApiError } from "../api/error";
import { Button } from "../components/button";
import { DialogClose, DialogFooter } from "../components/dialog";
import { HintText } from "../hint-text";
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
    <div className="flex flex-col">
      <Failure error={props.error} />
      {props.testing !== null && (
        <p className="px-[18px] pb-2 text-muted-foreground type-meta">
          Running the tests first: {props.testing}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        {!writer.shown && (
          <Button variant="ghost" onClick={writer.show}>
            Write it yourself
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => onWriteSpec?.()}
          disabled={onWriteSpec === null || writer.busy}
        >
          {writer.busy ? "Writing…" : "Write spec"}
        </Button>
        <Button onClick={props.onRun} disabled={props.runDisabled}>
          Run
        </Button>
      </DialogFooter>
      {/* The spec is optional, so its failure reads as a note under the button, not as a blocker. */}
      <Failure error={writer.error} />
    </div>
  );
}

/** A failure here sits on the dialog's own padding: the footer's hairline is below it. */
function Failure({ error }: { error: ApiError | null }) {
  if (error === null) {
    return null;
  }
  return (
    <div className="px-[18px] py-2">
      <p className="text-destructive type-body">{error.message}</p>
      {error.hint !== null && (
        <p className="mt-1 text-muted-foreground type-meta">
          <HintText hint={error.hint} />
        </p>
      )}
    </div>
  );
}
