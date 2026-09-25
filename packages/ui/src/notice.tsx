import type { ApiError } from "./api/error";
import { HintText } from "./hint-text";
import { NoticeLine } from "./notice/notice-line";

/**
 * The bootstrap failure, in the daemon's own words: what failed, then what to do. It stays until the
 * page loads, because a page that never loaded has nothing else to show (the banner's Retry is what
 * clears it).
 */
export function Notice({ error }: { error: ApiError | null }) {
  if (error === null) {
    return null;
  }
  return (
    <NoticeLine tone="error">
      {error.message}
      {error.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={error.hint} />
        </span>
      )}
    </NoticeLine>
  );
}
