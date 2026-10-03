import type { ApiError } from "./api/error";
import { Button } from "./components/button";
import { HintText } from "./hint-text";
import { NoticeLine } from "./notice/notice-line";

/** One line under the task header, in the daemon's own words: what failed, then what to do. */
export function Notice({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (error === null) {
    return null;
  }
  return (
    <NoticeLine
      tone="error"
      action={
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      {error.message}
      {error.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={error.hint} />
        </span>
      )}
    </NoticeLine>
  );
}
