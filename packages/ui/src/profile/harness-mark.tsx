import type { PlanVendor } from "@agnostic/core";
import type { HarnessId } from "@agnostic/core/browser";
import { harnessForVendor, harnessIdentity } from "@agnostic/registry/browser";
import { cn } from "../class-names";

/** A mark beside a row is 14 px, in a compare column 16 px, on a card 18 px. */
export type MarkSize = "row" | "column" | "card";

const BOX: Record<MarkSize, { side: number; letter: number; radius: number }> = {
  row: { side: 14, letter: 9, radius: 4 },
  column: { side: 16, letter: 10, radius: 4 },
  card: { side: 18, letter: 11, radius: 5 },
};

/** One or two letters for a harness: a placeholder until real vendor marks are licensed. */
export function markLetter(harness: HarnessId): string {
  return harnessIdentity(harness).mark;
}

/**
 * The harness whose `--mark-*` pair fills the box. `other:ralph` is agn saying only "an executable
 * I know nothing else about", and a custom property cannot be named after it, so it has no token.
 */
function markToken(harness: HarnessId): HarnessId | null {
  return harness.includes(":") ? null : harness;
}

/** Which harness is running, in the space a letter takes. */
export function HarnessMark({
  harness,
  size = "row",
  dim = false,
  className,
}: {
  harness: HarnessId;
  size?: MarkSize;
  /** Finished rows carry a dimmer mark, so the live ones read first. */
  dim?: boolean;
  className?: string;
}) {
  return (
    <Mark
      letter={markLetter(harness)}
      label={harness}
      tone={markToken(harness)}
      size={size}
      dim={dim}
      className={className}
    />
  );
}

/** A harness billed per provider key has no plan vendor to mark, and says so rather than guessing. */
export function VendorMark({
  vendor,
  size = "row",
}: {
  vendor: PlanVendor | null;
  size?: MarkSize;
}) {
  const identity = vendor === null ? null : harnessForVendor(vendor);
  if (identity === null) {
    return <Mark letter="?" label="no plan vendor" tone={null} size={size} />;
  }
  return <HarnessMark harness={identity.id} size={size} />;
}

type MarkProps = {
  letter: string;
  label: string;
  /** The harness whose `--mark-*` pair fills the box; null takes the neutral surface. */
  tone: HarnessId | null;
  size: MarkSize;
  dim?: boolean;
  className?: string;
};

function Mark({ letter, label, tone, size, dim, className }: MarkProps) {
  const box = BOX[size];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold leading-none",
        tone === null && "bg-secondary text-muted-foreground",
        className,
      )}
      style={{
        width: box.side,
        height: box.side,
        borderRadius: box.radius,
        fontSize: box.letter,
        opacity: dim === true ? 0.6 : undefined,
        // A harness without a token of its own falls back to the neutral surface in CSS, so it
        // gets a colour by adding `--mark-<id>` to tokens.css and nothing else.
        backgroundColor: tone === null ? undefined : `var(--mark-${tone}, var(--secondary))`,
        color:
          tone === null ? undefined : `var(--mark-${tone}-foreground, var(--muted-foreground))`,
      }}
    >
      {letter}
    </span>
  );
}
