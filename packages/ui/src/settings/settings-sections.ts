import { Keyboard, type LucideIcon, Palette, Terminal } from "lucide-react";

/** Only sections with a control behind them; 33b widens the union as the rest land (ADR 038). */
export type SettingsSectionId = "daemon" | "appearance" | "shortcuts";

export type SettingsSection = {
  id: SettingsSectionId;
  /** The nav heading it sits under, in the order the groups are written below. */
  group: string;
  label: string;
  icon: LucideIcon;
  /** Words the search matches besides the label: what a user would type looking for the section. */
  terms: string[];
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "daemon",
    group: "This computer",
    label: "Daemon and terminal",
    icon: Terminal,
    terms: ["agnd", "tmux", "pid", "version", "font", "size", "mono", "typeface"],
  },
  {
    id: "appearance",
    group: "App",
    label: "Appearance",
    icon: Palette,
    terms: ["theme", "colors", "colours", "dark", "light", "mode", "system"],
  },
  {
    id: "shortcuts",
    group: "App",
    label: "Shortcuts",
    icon: Keyboard,
    terms: ["keys", "keyboard", "command palette", "hotkey"],
  },
];

/** Sections whose label or any term contains the query, case-insensitively. */
export function filterSections(query: string): SettingsSection[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return SETTINGS_SECTIONS;
  }
  return SETTINGS_SECTIONS.filter((section) =>
    [section.label, ...section.terms].some((term) => term.toLowerCase().includes(needle)),
  );
}
