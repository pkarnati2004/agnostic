import { describe, expect, it } from "vitest";
// The file's own text, not the stylesheet Tailwind builds: this asks what the tokens say.
import CSS from "./tokens.css?raw";

/** The names in the design's core table, in its order. */
const CORE = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const STATUS = [
  "status-waiting",
  "status-running",
  "status-queued",
  "status-done",
  "status-failed",
  "status-stopped",
];

/** What agn adds to the design's two tables: every one of these is read by a component. */
const AGN = [
  "warning",
  "primary-foreground-muted",
  "terminal",
  "radius",
  "shadow-floating",
  "destructive-foreground",
  "diff-add-bg",
  "diff-add-fg",
  "diff-del-bg",
  "diff-del-fg",
];

/** `harness-mark.tsx` builds these names from a harness id, so the pairs must all be here. */
const MARKED_HARNESSES = ["claude-code", "codex", "opencode", "pi", "gemini"];

describe("tokens.css", () => {
  it("gives every token a value in both themes", () => {
    for (const theme of [":root,\n.dark", ".light"]) {
      const set = declared(theme);
      expect([...CORE, ...STATUS, ...AGN].filter((name) => !set.has(name))).toEqual([]);
    }
  });

  it("keeps the agent-question hue out: waiting orange is the one name for that meaning", () => {
    expect(CSS).not.toContain("agent-question");
  });

  it("declares exactly the same names in .light as in :root, .dark: a theme switch is a class, not a gap", () => {
    const dark = declared(":root,\n.dark");
    const light = declared(".light");
    expect([...light].sort()).toEqual([...dark].sort());
  });

  it("maps the new names for Tailwind's utilities", () => {
    const theme = block("@theme inline");
    expect(theme).toContain("--color-warning: var(--warning);");
    expect(theme).toContain("--color-terminal: var(--terminal);");
  });

  it("names the mono stack once, with the design's font first", () => {
    expect(CSS.match(/--font-mono:/g)).toHaveLength(1);
    expect(block("@theme inline")).toMatch(/--font-mono:\s+"JetBrains Mono",/);
  });

  it("holds both colours of every drawn harness mark", () => {
    for (const harness of MARKED_HARNESSES) {
      expect(CSS).toContain(`--mark-${harness}: #`);
      expect(CSS).toContain(`--mark-${harness}-foreground: #`);
    }
  });
});

/** The custom property names a block sets, which is what a theme switch has to cover. */
function declared(selector: string): Set<string> {
  const names: string[] = [];
  for (const [, name] of block(selector).matchAll(/^\s*--([\w-]+):/gm)) {
    if (name !== undefined) {
      names.push(name);
    }
  }
  return new Set(names);
}

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`tokens.css has no "${selector}" block`);
  }
  const end = CSS.indexOf("\n}", start);
  return CSS.slice(start, end);
}
