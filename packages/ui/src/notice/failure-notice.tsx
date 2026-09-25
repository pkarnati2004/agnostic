import type { ApiError } from "../api/error";
import { HintText } from "../hint-text";
import { NoticeLine } from "./notice-line";

/**
 * A failed call in the daemon's own words: what happened, then the command its hint names. The
 * notices that build their own sentence from a stored record draw themselves; this is for the
 * failures whose whole text is the error.
 */
export function FailureNotice({ error, className }: { error: ApiError; className?: string }) {
  return (
    <NoticeLine tone="error" className={className}>
      {error.message}
      {error.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={error.hint} />
        </span>
      )}
    </NoticeLine>
  );
}
