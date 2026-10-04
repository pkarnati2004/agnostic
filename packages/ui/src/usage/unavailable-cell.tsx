import type { HarnessId } from "@agnostic/core/browser";
import { harnessIdentity } from "@agnostic/registry/browser";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";

/**
 * The agents on this machine that record no usage anywhere agn can read, after the plan cells and
 * before the budget. They are named rather than left out: an agent missing from the bar would
 * otherwise read as one that spent nothing today (ADR 029, 2026-09-30).
 */
export function UnavailableCell({ harnesses }: { harnesses: HarnessId[] }) {
  if (harnesses.length === 0) {
    return null;
  }
  const names = harnesses.map((harness) => harnessIdentity(harness).name);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-cell="unavailable"
          className="flex h-7 shrink-0 items-center whitespace-nowrap border-border border-r px-3"
        >
          no usage: {names.join(", ")}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          {names.map((name) => (
            <span key={name}>
              Usage is not available for {name}: nothing on this machine records it.
            </span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
