import type { PlanVendor } from "@agnostic/core";

/** What each vendor is called in one or two letters, so a row reads before the label does. */
const MONOGRAM: Record<PlanVendor, string> = {
  claude: "C",
  chatgpt: "O",
  google: "G",
  xai: "X",
  moonshot: "M",
  cursor: "Cu",
};

/** A harness billed per provider key has no vendor to mark, and says so rather than guessing. */
export function VendorMark({ vendor }: { vendor: PlanVendor | null }) {
  const name = vendor ?? "no plan vendor";
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-[9px] text-muted-foreground"
    >
      {vendor === null ? "?" : MONOGRAM[vendor]}
    </span>
  );
}
