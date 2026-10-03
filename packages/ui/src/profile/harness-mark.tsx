import type { PlanVendor } from "@agnostic/core";
import type { HarnessId } from "@agnostic/core/browser";
import { cn } from "../class-names";

/** A mark beside a row is 14 px, in a compare column 16 px, on a card 18 px. */
export type MarkSize = "row" | "column" | "card";

/** The harnesses with a letter of their own; every other one takes two letters of its name. */
const MARKS: Record<string, string> = {
  "claude-code": "C",
  codex: "X",
  opencode: "O",
  pi: "π",
  gemini: "G",
};

/** Which harness a plan's vendor bills for, so one company reads as one mark across the page. */
const VENDOR_HARNESS: Record<PlanVendor, HarnessId> = {
  claude: "claude-code",
  chatgpt: "codex",
  google: "gemini",
  xai: "grok",
  moonshot: "kimi",
  cursor: "cursor-agent",
};

const BOX: Record<MarkSize, { side: number; letter: number; radius: number }> = {
  row: { side: 14, letter: 9, radius: 4 },
  column: { side: 16, letter: 10, radius: 4 },
  card: { side: 18, letter: 11, radius: 5 },
};

/** One or two letters for a harness: a placeholder until real vendor marks are licensed. */
export function markLetter(harness: HarnessId): string {
  const mark = MARKS[harness];
  if (mark !== undefined) {
    return mark;
  }
  // `other:ralph` is agn saying only "an executable I know nothing else about": mark the executable.
  const name = harness.startsWith("other:") ? harness.slice("other:".length) : harness;
  return name.slice(0, 1).toUpperCase() + name.slice(1, 2);
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
      tone={harness in MARKS ? harness : null}
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
  if (vendor === null) {
    return <Mark letter="?" label="no plan vendor" tone={null} size={size} />;
  }
  return <HarnessMark harness={VENDOR_HARNESS[vendor]} size={size} />;
}

type MarkProps = {
  letter: string;
  label: string;
  /** The harness whose `--mark-*` pair fills the box; null takes the neutral one. */
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
        backgroundColor: tone === null ? undefined : `var(--mark-${tone})`,
        color: tone === null ? undefined : `var(--mark-${tone}-foreground)`,
      }}
    >
      {letter}
    </span>
  );
}
