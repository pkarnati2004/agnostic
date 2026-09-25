import type { EvidenceLevel } from "@agnostic/core";
import { cn } from "../class-names";

/**
 * What the pick rests on, as a word: measured runs of this task class, related benchmarks, model
 * scores alone, or nothing. Confidence is never a percentage here (brief §6).
 */
const LEVELS: Record<EvidenceLevel, string> = {
  strong: "bg-secondary text-foreground",
  some: "border border-input text-foreground",
  "model-level": "border border-border text-muted-foreground",
  none: "border border-input border-dashed text-muted-foreground",
};

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return (
    <span
      data-level={level}
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] px-[7px] py-px text-[11px]",
        LEVELS[level],
      )}
    >
      Evidence: {level}
    </span>
  );
}
