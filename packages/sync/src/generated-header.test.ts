import { describe, expect, it } from "vitest";
import { GENERATED_HEADER, isGenerated, renderTarget } from "./generated-header.js";

const INSTRUCTIONS = "# app\n\nRun `pnpm test`.\n";

describe("renderTarget", () => {
  it("puts the instructions under the header, ending in one newline", () => {
    const text = renderTarget("AGENTS.md", INSTRUCTIONS);
    expect(text).toBe(`${GENERATED_HEADER}\n\n# app\n\nRun \`pnpm test\`.\n`);
  });

  it("keeps the body verbatim apart from the trailing newlines", () => {
    expect(renderTarget("AGENTS.md", "  indented\n\ttab\n\n\n")).toBe(
      `${GENERATED_HEADER}\n\n  indented\n\ttab\n`,
    );
  });

  it("writes the header alone when there are no instructions", () => {
    expect(renderTarget("AGENTS.md", "")).toBe(`${GENERATED_HEADER}\n`);
  });

  it("makes CLAUDE.md Claude Code's import of AGENTS.md, not a second copy", () => {
    expect(renderTarget("CLAUDE.md", INSTRUCTIONS)).toBe(`${GENERATED_HEADER}\n\n@AGENTS.md\n`);
  });
});

describe("isGenerated", () => {
  it("is true for a file agn rendered", () => {
    expect(isGenerated(renderTarget("AGENTS.md", INSTRUCTIONS))).toBe(true);
  });

  it("is false when the header is not the first line", () => {
    expect(isGenerated(`# app\n${GENERATED_HEADER}\n`)).toBe(false);
  });

  it("is false for an empty file", () => {
    expect(isGenerated("")).toBe(false);
  });
});
