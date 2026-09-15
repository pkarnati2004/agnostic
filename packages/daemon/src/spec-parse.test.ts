import { describe, expect, it } from "vitest";
import { type ParsedSpec, parseSpecAnswer } from "./spec-parse.js";

const WELL_FORMED = `# Add a verbose flag

## Spec

Add \`--verbose\` to \`src/main.ts\`.

## Acceptance

- [ ] the flag prints a line per step
- [ ] the default output is unchanged
`;

describe("parseSpecAnswer", () => {
  it("reads a well-formed answer", () => {
    const parsed: ParsedSpec | null = parseSpecAnswer(WELL_FORMED);
    expect(parsed).toEqual({
      title: "Add a verbose flag",
      spec: "Add `--verbose` to `src/main.ts`.",
      acceptance: "- [ ] the flag prints a line per step\n- [ ] the default output is unchanged",
    });
  });

  it("strips one fence the whole answer was wrapped in", () => {
    const fenced = (tag: string) => `\`\`\`${tag}\n${WELL_FORMED.trim()}\n\`\`\`\n`;
    expect(parseSpecAnswer(fenced("markdown"))).toEqual(parseSpecAnswer(WELL_FORMED));
    expect(parseSpecAnswer(fenced(""))).toEqual(parseSpecAnswer(WELL_FORMED));
  });

  it("leaves a fence that is part of the spec alone", () => {
    const parsed = parseSpecAnswer("# T\n\n## Spec\n\n```sh\nagn run\n```\n");
    expect(parsed?.spec).toBe("```sh\nagn run\n```");
  });

  it("takes the headings case-insensitively and with a trailing colon", () => {
    const parsed = parseSpecAnswer(
      "# T\n\n## spec:\n\nbody\n\n## Acceptance criteria\n\n- [ ] x\n",
    );
    expect(parsed).toEqual({ title: "T", spec: "body", acceptance: "- [ ] x" });
  });

  it("answers null acceptance when the model wrote none", () => {
    expect(parseSpecAnswer("# T\n\n## Spec\n\nbody\n\n## Acceptance\n\n")?.acceptance).toBeNull();
    expect(parseSpecAnswer("# T\n\n## Spec\n\nbody\n")?.acceptance).toBeNull();
  });

  it("treats everything after the title as the spec when there is no ## Spec", () => {
    expect(parseSpecAnswer("# T\n\nrewrite the parser\nand the printer\n")).toEqual({
      title: "T",
      spec: "rewrite the parser\nand the printer",
      acceptance: null,
    });
  });

  it("ignores prose the model wrote before the first heading", () => {
    const parsed = parseSpecAnswer(
      "Sure, here is the spec you asked for:\n\n# T\n\n## Spec\n\nbody\n",
    );
    expect(parsed).toEqual({ title: "T", spec: "body", acceptance: null });
  });

  it("takes the whole answer as the spec, with no title, when it has no headings at all", () => {
    expect(parseSpecAnswer("just rewrite the parser and the printer\nno headings here\n")).toEqual({
      title: null,
      spec: "just rewrite the parser and the printer\nno headings here",
      acceptance: null,
    });
  });

  it("folds an unexpected section into the spec one level down", () => {
    const parsed = parseSpecAnswer(
      "# T\n\n## Spec\n\nbody\n\n## Notes\n\nwatch the cache\n\n## Acceptance\n\n- [ ] x\n",
    );
    expect(parsed?.spec).toBe("body\n\n### Notes\n\nwatch the cache");
    expect(parsed?.acceptance).toBe("- [ ] x");
  });

  it("gives a plain bullet a box, and leaves a boxed one as it is", () => {
    const parsed = parseSpecAnswer(
      "# T\n\n## Spec\n\nbody\n\n## Acceptance\n\n- one\n* two\n1. three\n- [x] four\n",
    );
    expect(parsed?.acceptance).toBe("- [ ] one\n- [ ] two\n- [ ] three\n- [x] four");
  });

  it("demotes a heading line left inside a body", () => {
    const parsed = parseSpecAnswer(
      "# T\n\n## Spec\n\nbody\n\n## Acceptance\n\n- [ ] x\n## \n- [ ] y\n",
    );
    expect(parsed?.acceptance).toBe("- [ ] x\n### \n- [ ] y");
  });

  it("reads CRLF the same as LF", () => {
    expect(parseSpecAnswer(WELL_FORMED.replace(/\n/g, "\r\n"))).toEqual(
      parseSpecAnswer(WELL_FORMED),
    );
  });

  it("answers null when there is no spec in it at all", () => {
    expect(parseSpecAnswer("")).toBeNull();
    expect(parseSpecAnswer("   \n\n \n")).toBeNull();
    expect(parseSpecAnswer("# Only a title\n")).toBeNull();
  });

  it("cuts an over-long title at eighty characters", () => {
    const parsed = parseSpecAnswer(`# ${"a".repeat(200)}\n\n## Spec\n\nbody\n`);
    expect(parsed?.title).toHaveLength(80);
  });
});
