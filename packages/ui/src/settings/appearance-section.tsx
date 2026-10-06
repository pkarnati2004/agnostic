import {
  type Appearance,
  COLOR_MODES,
  type ColorMode,
  DEFAULT_APPEARANCE,
  type ThemeId,
} from "@agnostic/core/browser";
import { cn } from "../class-names";
import { THEME_CARDS } from "../styles/theme-catalog";
import { SettingsGroupHeading, SettingsRow } from "./settings-row";
import { ThemeCard } from "./theme-card";

const MODE_LABELS: Record<ColorMode, string> = { dark: "Dark", light: "Light", system: "System" };

type AppearanceSectionProps = {
  appearance: Appearance;
  /** What the page resolved "system" to, so a card's swatch previews the theme as it looks now. */
  scheme: "dark" | "light";
  onTheme: (theme: ThemeId) => void;
  onMode: (mode: ColorMode) => void;
};

export function AppearanceSection(props: AppearanceSectionProps) {
  return (
    <>
      <SettingsGroupHeading
        title="Theme"
        description="Changes colors and interface fonts. Status meanings stay the same in every theme."
      />
      <div
        className="mt-3.5 grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}
      >
        {THEME_CARDS.map((card) => (
          <ThemeCard
            key={card.id}
            card={card}
            selected={card.id === props.appearance.theme}
            scheme={props.scheme}
            isDefault={card.id === DEFAULT_APPEARANCE.theme}
            onPick={props.onTheme}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col">
        <SettingsRow label="Mode" description="System follows macOS.">
          <ModeControl mode={props.appearance.mode} onMode={props.onMode} />
        </SettingsRow>
      </div>
    </>
  );
}

function ModeControl({ mode, onMode }: { mode: ColorMode; onMode: (mode: ColorMode) => void }) {
  return (
    <fieldset className="flex rounded-lg border border-border bg-background p-[3px]">
      <legend className="sr-only">Mode</legend>
      {COLOR_MODES.map((option) => (
        <label
          key={option}
          className={cn(
            "cursor-pointer rounded-md px-3.5 py-[5px] text-[12.5px]",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            option === mode ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name="appearance-mode"
            className="sr-only"
            checked={option === mode}
            onChange={() => onMode(option)}
          />
          {MODE_LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}
