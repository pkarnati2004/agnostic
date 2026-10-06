import { describe, expect, it } from "vitest";
// The file's own text, not the stylesheet Tailwind builds: this asks what the tokens say.
import CSS from "./tokens.css?raw";

/** Every theme stylesheet, by file name, so a theme added without a block fails here. */
const THEMES = import.meta.glob<string>("./themes/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

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
  it("gives every token a value in the base, which is Claudette dark", () => {
    const set = declared(CSS, ":root");
    expect([...CORE, ...STATUS, ...AGN].filter((name) => !set.has(name))).toEqual([]);
  });

  it("keeps the agent-question hue out: waiting orange is the one name for that meaning", () => {
    expect(CSS).not.toContain("agent-question");
  });

  it("maps the new names for Tailwind's utilities", () => {
    const theme = block(CSS, "@theme inline");
    expect(theme).toContain("--color-warning: var(--warning);");
    expect(theme).toContain("--color-terminal: var(--terminal);");
  });

  it("reaches the theme's own stacks through one indirection, with the design's mono first", () => {
    const theme = block(CSS, "@theme inline");
    expect(theme).toContain("--font-mono: var(--font-stack-mono);");
    expect(theme).toContain("--font-sans: var(--font-stack-sans);");
    expect(block(CSS, ":root")).toMatch(/--font-stack-mono:\s+"JetBrains Mono",/);
  });

  it("holds both colours of every drawn harness mark", () => {
    for (const harness of MARKED_HARNESSES) {
      expect(CSS).toContain(`--mark-${harness}: #`);
      expect(CSS).toContain(`--mark-${harness}-foreground: #`);
    }
  });
});

describe("styles/themes/*.css", () => {
  /** What a theme block has to cover: every token `:root` sets, bar the two base font stacks. */
  const base = [...declared(CSS, ":root")].filter((name) => !name.startsWith("font-stack")).sort();

  it("holds a dark block for every theme, Claudette's repeating :root for the swatch", () => {
    const dark = themeBlocks().filter(({ selector }) => selector.endsWith(".dark"));
    expect(dark.map(({ selector }) => selector).sort()).toEqual(
      ["carbon", "claudette", "dusk", "ink", "moss", "paper", "rosewood", "slate"].map(
        (id) => `[data-theme="${id}"].dark`,
      ),
    );
    // The block repeats :root value for value, so a swatch on another theme's page draws Claudette.
    const claudette = dark.find(({ selector }) => selector.includes("claudette"));
    expect(claudette).toBeDefined();
    const theirs = values(text(claudette?.sheet ?? ""), '[data-theme="claudette"].dark');
    const root = values(CSS, ":root");
    for (const [name, value] of theirs) {
      expect(root.get(name), name).toBe(value);
    }
  });

  it("holds a light block for every theme: no theme is dark-only", () => {
    const light = themeBlocks().filter(({ selector }) => selector.endsWith(".light"));
    expect(light).toHaveLength(8);
  });

  it("gives every block the names :root does, so a theme switch is never a gap", () => {
    for (const { sheet, selector } of themeBlocks()) {
      const names = [...declared(text(sheet), selector)];
      expect(names.filter((name) => !name.startsWith("font-stack")).sort(), selector).toEqual(base);
    }
  });

  it("gives a block both font stacks or neither: a sans with no mono would be half a theme", () => {
    for (const { sheet, selector } of themeBlocks()) {
      const stacks = [...declared(text(sheet), selector)]
        .filter((name) => name.startsWith("font-stack"))
        .sort();
      expect(stacks, selector).toEqual(
        stacks.length === 0 ? [] : ["font-stack-mono", "font-stack-sans"],
      );
    }
  });

  it("names a family in a stack and nothing else: the faces all live in fonts.css", () => {
    for (const sheet of Object.keys(THEMES)) {
      expect(text(sheet), sheet).not.toContain("@font-face");
      expect(text(sheet), sheet).not.toContain("url(");
    }
  });
});

/** The custom property names a block sets, which is what a theme switch has to cover. */
function declared(css: string, selector: string): Set<string> {
  const names: string[] = [];
  for (const [, name] of block(css, selector).matchAll(/^\s*--([\w-]+):/gm)) {
    if (name !== undefined) {
      names.push(name);
    }
  }
  return new Set(names);
}

/** Name to value for a block, so one block can be checked against another. */
function values(css: string, selector: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const [, name, value] of block(css, selector).matchAll(/^\s*--([\w-]+):\s*(.+?);\s*$/gm)) {
    if (name !== undefined && value !== undefined) {
      pairs.set(name, value);
    }
  }
  return pairs;
}

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`no "${selector}" block`);
  }
  return css.slice(start, css.indexOf("\n}", start));
}

/** `?raw` hands back the file's own text; anything else means the sheet was not read as source. */
function text(sheet: string): string {
  const css = THEMES[sheet];
  if (typeof css !== "string") {
    throw new Error(`${sheet} did not import as text`);
  }
  return css;
}

/** Every `[data-theme=…].dark|.light` selector in the themes directory, with the file it is in. */
function themeBlocks(): { sheet: string; selector: string }[] {
  const blocks: { sheet: string; selector: string }[] = [];
  for (const sheet of Object.keys(THEMES)) {
    for (const [selector] of text(sheet).matchAll(/\[data-theme="[a-z]+"\]\.(?:dark|light)/g)) {
      blocks.push({ sheet, selector });
    }
  }
  return blocks;
}
