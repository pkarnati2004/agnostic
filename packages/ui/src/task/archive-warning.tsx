import { TriangleAlert } from "lucide-react";
import { Button } from "../components/button";
import { HintText } from "../hint-text";
import type { ArchiveWarning } from "./archive-copy";

/**
 * The answer to an archive the daemon held back, where the click was: inside the row menu, or
 * under the task header. Keep closes it; Archive anyway asks again with `force`.
 */
export function ArchiveWarningCard({
  warning,
  busy,
  onKeep,
  onArchiveAnyway,
}: {
  warning: ArchiveWarning;
  busy: boolean;
  onKeep: () => void;
  onArchiveAnyway: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-2.5 py-2 text-[12.5px]">
      <span className="flex items-start gap-2">
        <TriangleAlert className="mt-[2px] size-3.5 shrink-0" style={{ color: "var(--warning)" }} />
        <span className="text-foreground">{warning.title}</span>
      </span>
      <span className="text-muted-foreground">
        <HintText hint={warning.body} />
      </span>
      <span className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onKeep}>
          Keep
        </Button>
        <Button variant="destructive" size="sm" disabled={busy} onClick={onArchiveAnyway}>
          Archive anyway
        </Button>
      </span>
    </div>
  );
}
