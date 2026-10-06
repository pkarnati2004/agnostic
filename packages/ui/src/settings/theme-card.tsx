import type { ThemeId } from "@agnostic/core/browser";
import { cn } from "../class-names";
import { Badge } from "../components/badge";
import type { ThemeCard as ThemeCardRow } from "../styles/theme-catalog";

/** The four bands of the swatch, widest first: the page, its text, waiting and running. */
const BANDS = [
  { token: "--background", grow: "flex-[2]" },
  { token: "--foreground", grow: "flex-1" },
  { token: "--status-waiting", grow: "flex-1" },
  { token: "--status-running", grow: "flex-1" },
];

type ThemeCardProps = {
  card: ThemeCardRow;
  selected: boolean;
  /** The scheme the page is drawn in, so the swatch previews the theme as it would look now. */
  scheme: "dark" | "light";
  isDefault: boolean;
  onPick: (theme: ThemeId) => void;
};

/**
 * One theme to choose from. The swatch carries the theme's own `data-theme` and the page's scheme
 * class, so its bands read the theme's tokens straight from its stylesheet: no hex is written here.
 */
export function ThemeCard({ card, selected, scheme, isDefault, onPick }: ThemeCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-theme-card={card.id}
      onClick={() => onPick(card.id)}
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border p-2.5 text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-ring bg-[color-mix(in_srgb,var(--ring)_8%,transparent)]"
          : "border-border bg-sidebar hover:bg-accent",
      )}
    >
      <span
        aria-hidden
        data-theme={card.id}
        className={cn("flex h-9 overflow-hidden rounded-md border border-border", scheme)}
      >
        {BANDS.map((band) => (
          <span
            key={band.token}
            className={band.grow}
            style={{ backgroundColor: `var(${band.token})` }}
          />
        ))}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex-1 font-semibold text-[13px]">{card.name}</span>
        {isDefault && <Badge variant="outline">Default</Badge>}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{card.fonts}</span>
    </button>
  );
}
