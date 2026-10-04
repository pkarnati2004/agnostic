import type { PlanOption, PlanVendor } from "@agnostic/core";
import { useState } from "react";
import { Badge } from "../components/badge";
import { HintText } from "../hint-text";
import { VENDOR_NAME } from "./format-usage";

/**
 * The one place the workspace asks for something it could not detect: which plan this vendor bills
 * the user on. A chip writes it, the same entry `agn doctor --plan` writes, and the cell turns into
 * the plan's figures on the next read. Never a modal, and never asked twice on one page load.
 */
export function PlanQuestion({
  vendor,
  options,
  busy,
  onPick,
}: {
  vendor: PlanVendor;
  /** Null while `POST /doctor` is still detecting, which takes seconds on a slow machine. */
  options: PlanOption[] | null;
  busy: boolean;
  onPick: (planId: string) => void;
}) {
  const [other, setOther] = useState(false);
  const name = VENDOR_NAME[vendor];
  const plans = options?.filter((option) => option.vendor === vendor) ?? [];
  return (
    // A fieldset, because the chips are one question with one answer; its own styling is dropped.
    <fieldset className="flex items-center gap-2 border-0 p-0" aria-label={`${name} plan`}>
      <span>Which {name} plan are you on?</span>
      {options === null && <span>…</span>}
      {other ? (
        <span>
          <HintText hint={`Set it with \`agn doctor --plan ${vendor}=<name>\``} />
        </span>
      ) : (
        plans.map((option) => (
          <Chip key={option.id} busy={busy} onClick={() => onPick(option.id)}>
            {option.displayName}
          </Chip>
        ))
      )}
      {options !== null && !other && (
        <Chip busy={busy} muted onClick={() => setOther(true)}>
          Other
        </Chip>
      )}
    </fieldset>
  );
}

/** The design's outline badge, made clickable: a button around the badge, not a badge that listens. */
function Chip({
  children,
  busy,
  muted,
  onClick,
}: {
  children: string;
  busy: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="disabled:opacity-50">
      <Badge variant="outline" className={muted === true ? "h-5" : "h-5 text-foreground"}>
        {children}
      </Badge>
    </button>
  );
}
