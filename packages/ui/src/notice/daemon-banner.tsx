import { Unplug } from "lucide-react";
import { Button } from "../components/button";
import { HintText } from "../hint-text";
import { NoticeLine } from "./notice-line";

const LINE =
  "agnd is not running. Start it with `agn daemon start` and this window reconnects. " +
  "Agents keep running in tmux meanwhile.";

/**
 * One line across the top of the centre while the page cannot reach the daemon. It says the thing a
 * user most needs to know first: the agents are in tmux and are still working (brief §5).
 */
export function DaemonBanner({ shown, onRetry }: { shown: boolean; onRetry: () => void }) {
  if (!shown) {
    return null;
  }
  return (
    <NoticeLine
      tone="error"
      icon={Unplug}
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      <HintText hint={LINE} />
    </NoticeLine>
  );
}
