import type { ApiError } from "./api/error";
import { Button } from "./components/button";
import { HintText } from "./hint-text";

/** One line under the task header, in the daemon's own words: what failed, then what to do. */
export function Notice({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (error === null) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 border-border border-b bg-card px-6 py-3"
    >
      <div className="min-w-0">
        <p className="text-destructive text-sm">{error.message}</p>
        {error.hint !== null && (
          <p className="mt-1 text-muted-foreground text-xs">
            <HintText hint={error.hint} />
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
