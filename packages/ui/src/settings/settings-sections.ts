import {
  Bot,
  FolderGit2,
  Keyboard,
  KeyRound,
  type LucideIcon,
  Palette,
  Scale,
  Terminal,
} from "lucide-react";

/** Only sections with a control behind them: a row with nothing behind it is not drawn (ADR 038). */
export type SettingsSectionId =
  | "agents"
  | "plans"
  | "recommendations"
  | "tasks"
  | "daemon"
  | "appearance"
  | "shortcuts";

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
    id: "agents",
    group: "Agents",
    label: "Agents and profiles",
    icon: Bot,
    terms: ["harness", "detected", "doctor", "model", "route", "spec writer", "profile"],
  },
  {
    id: "plans",
    group: "Agents",
    label: "Plans and keys",
    icon: KeyRound,
    terms: ["plan", "subscription", "api key", "environment", "claude", "chatgpt", "limits"],
  },
  {
    id: "recommendations",
    group: "Agents",
    label: "Recommendations",
    icon: Scale,
    terms: ["catalog", "benchmark", "scores", "stale", "risk", "sync"],
  },
  {
    id: "tasks",
    group: "Work",
    label: "Tasks and worktrees",
    icon: FolderGit2,
    terms: ["worktree", "branch", "spec", "editor", "open in editor"],
  },
  {
    id: "daemon",
    group: "This computer",
    label: "Daemon and terminal",
    icon: Terminal,
    terms: [
      "agnd",
      "tmux",
      "pid",
      "version",
      "font",
      "size",
      "mono",
      "typeface",
      "status line",
      "commands",
    ],
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

/** The three sections that read `POST /doctor`; the others draw from config and the repo list. */
export function needsDoctor(id: SettingsSectionId): boolean {
  return id === "agents" || id === "plans" || id === "daemon";
}

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
