import { describe, expect, it } from "vitest";
import {
  GENERATED_HEADER,
  generatedHeader,
  isGenerated,
  renderTarget,
} from "./generated-header.js";

const WORKFLOW_HEADER = generatedHeader(".ag/workflows/tiered.yaml");
const FRONT_MATTER = "---\nname: architect\n---";

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

  it("is true when the header is the first line under a front-matter block", () => {
    expect(isGenerated(`${FRONT_MATTER}\n${WORKFLOW_HEADER}\n\nDo the work.\n`)).toBe(true);
  });

  it("is false for a front-matter file with no header", () => {
    expect(isGenerated(`${FRONT_MATTER}\n\nmy own agent\n`)).toBe(false);
  });

  it("is false for a header inside the front matter", () => {
    expect(isGenerated(`---\n${WORKFLOW_HEADER}\n---\n\nmy own agent\n`)).toBe(false);
  });

  it("is false for a front-matter block that was never closed", () => {
    expect(isGenerated(`---\nname: architect\n\n${WORKFLOW_HEADER}\n`)).toBe(false);
  });
});
