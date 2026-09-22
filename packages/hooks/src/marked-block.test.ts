import { describe, expect, it } from "vitest";
import { HooksError } from "./error.js";
import { type MarkedBlock, withMarkedBlock, withoutMarkedBlock } from "./marked-block.js";

/** One owner's markers; `codex/config-block.ts` and `hooks-toml-file.ts` each define their own. */
function block(owner: string): MarkedBlock {
  return {
    begin: `# >>> ${owner} begin >>>`,
    end: `# <<< ${owner} end <<<`,
    refuse: (why) =>
      new HooksError(`agn will not edit this file: ${why}`, {
        code: "hook-config-unwritable",
        hint: "test fixture",
      }),
  };
}

const AGN = block("agn");

describe("withMarkedBlock", () => {
  it("writes the block alone into an empty file", () => {
    expect(withMarkedBlock("", AGN, "body\n")).toBe(
      "# >>> agn begin >>>\nbody\n# <<< agn end <<<\n",
    );
  });

  it("appends the block after content with no trailing newline", () => {
    const text = withMarkedBlock("existing content", AGN, "body\n");
    expect(text).toBe("existing content\n\n# >>> agn begin >>>\nbody\n# <<< agn end <<<\n");
  });

  it("leaves a different owner's block untouched when installing its own", () => {
    const other = block("kimi");
    const withOther = withMarkedBlock("[provider]\nname = 1\n", other, "kimi body\n");
    const withBoth = withMarkedBlock(withOther, AGN, "agn body\n");
    // Kimi's block survives byte for byte; only agn's block was added.
    expect(withBoth).toContain("# >>> kimi begin >>>\nkimi body\n# <<< kimi end <<<\n");
    expect(withBoth).toBe(`${withOther}\n# >>> agn begin >>>\nagn body\n# <<< agn end <<<\n`);
    // Removing agn's own block leaves the other owner's exactly as it was.
    expect(withoutMarkedBlock(withBoth, AGN)).toBe(withOther);
  });

  it("preserves CRLF line endings in the user's own content around the block", () => {
    const crlf = "[section]\r\nkey = 1\r\n";
    const withBlock = withMarkedBlock(crlf, AGN, "body\n");
    expect(withBlock.startsWith(crlf)).toBe(true);
    // Round-tripping through install and remove gives back exactly the original CRLF bytes.
    expect(withoutMarkedBlock(withBlock, AGN)).toBe(crlf);
  });

  it("removes the block and leaves every other byte exactly as it was", () => {
    const before = "line one\nline two\n\nline three\n";
    const withBlock = withMarkedBlock(before, AGN, "a\nb\n");
    expect(withoutMarkedBlock(withBlock, AGN)).toBe(before);
  });

  it("an empty body removes the block instead of writing an empty one", () => {
    const withBlock = withMarkedBlock("kept\n", AGN, "body\n");
    expect(withMarkedBlock(withBlock, AGN, "")).toBe("kept\n");
  });

  it("refuses a block whose begin marker appears twice", () => {
    const doubled = `${withMarkedBlock("", AGN, "a\n")}${AGN.begin}\n`;
    expect(() => withMarkedBlock(doubled, AGN, "b\n")).toThrow(
      expect.objectContaining({ code: "hook-config-unwritable" }),
    );
  });
});
