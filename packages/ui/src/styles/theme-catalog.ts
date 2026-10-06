import type { ThemeId } from "@agnostic/core/browser";

export type ThemeCard = {
  id: ThemeId;
  name: string;
  /** The interface sans and the mono the theme names, as the card prints them. */
  fonts: string;
};

const SYSTEM_PAIR = "System sans · JetBrains Mono";

/**
 * The eight cards the Appearance grid draws, in the design's order. A theme names its fonts in its
 * own stylesheet; this is the line that says so on the card, and the only place the names are
 * written for a reader. A family the machine does not have falls back through the base stack.
 */
export const THEME_CARDS: ThemeCard[] = [
  { id: "rosewood", name: "Rosewood", fonts: SYSTEM_PAIR },
  { id: "claudette", name: "Claudette", fonts: SYSTEM_PAIR },
  { id: "slate", name: "Slate", fonts: "IBM Plex Sans · Plex Mono" },
  { id: "paper", name: "Paper", fonts: "Geist · Geist Mono" },
  { id: "ink", name: "Ink", fonts: "Schibsted Grotesk · Fira Code" },
  { id: "moss", name: "Moss", fonts: "Red Hat Text · Red Hat Mono" },
  { id: "carbon", name: "Carbon", fonts: "Instrument Sans · DM Mono" },
  { id: "dusk", name: "Dusk", fonts: "Figtree · Spline Sans Mono" },
];
