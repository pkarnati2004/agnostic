import { describe, expect, it } from "vitest";
// The file's own text: this asks what the scale says, the same way tokens.test.ts reads tokens.css.
import CSS from "./type.css?raw";

/** The design's seven steps, in the handoff's order, with the properties that must travel together. */
const STEPS: Array<{ name: string; declarations: string[] }> = [
  {
    name: "type-display",
    declarations: [
      "font-size: 24px;",
      "font-weight: 600;",
      "letter-spacing: -0.015em;",
      "line-height: 1.2;",
    ],
  },
  {
    name: "type-title",
    declarations: ["font-size: 15px;", "font-weight: 600;", "line-height: 1.3;"],
  },
  {
    name: "type-heading",
    declarations: ["font-size: 14px;", "font-weight: 600;", "line-height: 1.35;"],
  },
  {
    name: "type-body",
    declarations: ["font-size: 13px;", "font-weight: 400;", "line-height: 1.45;"],
  },
  {
    name: "type-meta",
    declarations: ["font-size: 12px;", "font-weight: 400;", "line-height: 1.4;"],
  },
  {
    name: "type-label",
    declarations: [
      "font-size: 10.5px;",
      "font-weight: 600;",
      "letter-spacing: 0.08em;",
      "text-transform: uppercase;",
    ],
  },
  {
    name: "type-mono",
    declarations: ["font-family: var(--font-mono);", "font-size: 11.5px;", "font-weight: 400;"],
  },
  { name: "type-mono-lg", declarations: ["font-family: var(--font-mono);", "font-size: 12px;"] },
];

describe("type.css", () => {
  it("defines every step the design names, with its size, weight, tracking and case", () => {
    for (const step of STEPS) {
      const block = utility(step.name);
      for (const declaration of step.declarations) {
        expect(block, step.name).toContain(declaration);
      }
    }
  });

  it("names no step the design does not: the scale is exactly seven steps plus the mono headers", () => {
    const names = [...CSS.matchAll(/@utility\s+([\w-]+)/g)].map(([, name]) => name);
    expect(names.sort()).toEqual(STEPS.map((step) => step.name).sort());
  });

  it("keys the mono steps off the one font stack tokens.css names, not a hex or a literal family", () => {
    expect(utility("type-mono")).toContain("var(--font-mono)");
    expect(utility("type-mono-lg")).toContain("var(--font-mono)");
  });

  it("gives the queued glyph its one keyframe, spinning a full turn", () => {
    expect(CSS).toMatch(/@keyframes glyph-spin\s*{\s*to\s*{\s*transform: rotate\(360deg\);/);
  });
});

/** The declarations inside one `@utility name { … }` block. */
function utility(name: string): string {
  const start = CSS.indexOf(`@utility ${name} {`);
  if (start === -1) {
    throw new Error(`type.css has no "${name}" utility`);
  }
  const end = CSS.indexOf("}", start);
  return CSS.slice(start, end);
}
