import { describe, expect, it } from "vitest";
import { CoreError } from "./error.js";
import {
  AGN_TABLE_MARKER,
  type MarkedBlock,
  withMarkedBlock,
  withoutMarkedBlock,
} from "./marked-block.js";

/** One owner's markers; the hooks package defines one per file format it writes into. */
function block(owner: string): MarkedBlock {
  return {
    begin: `# >>> ${owner} begin >>>`,
    end: `# <<< ${owner} end <<<`,
    refuse: (why) =>
      new CoreError(`agn will not edit this file: ${why}`, {
        code: "block-unwritable",
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
      expect.objectContaining({ code: "block-unwritable" }),
    );
  });
});

describe("a block whose tables agn marks as its own", () => {
  const THEIRS = '[state."theirs"]\nhash = "x"\n';

  /** A file whose block holds `body`, as it stands before agn rewrites it. */
  function fileWith(body: string): string {
    return `notify = ["x"]\n\n# >>> agn begin >>>\n${body}# <<< agn end <<<\n`;
  }

  /** A table agn wrote: the marker is its first line under the header. */
  function mine(name: string, value: string): string {
    return `[state."${name}"]\n${AGN_TABLE_MARKER}\nhash = "${value}"\n`;
  }

  it("writes the marker under each header of the body it is given", () => {
    expect(withMarkedBlock("", AGN, mine("mine", "1"))).toContain(
      `[state."mine"]\n${AGN_TABLE_MARKER}\n`,
    );
    // Every writer builds the marker line from this literal, and fixtures spell it out.
    expect(AGN_TABLE_MARKER).toBe("# agn");
  });

  it("moves a table appended inside the block below the end marker", () => {
    // Codex appends its trust table after the last one in the file, which is the last one in agn's
    // block; agn's next write keeps it and puts it where agn's writes cannot reach it.
    const appended = fileWith(`${mine("mine", "1")}${THEIRS}`);
    expect(withMarkedBlock(appended, AGN, mine("mine", "2"))).toBe(
      `${fileWith(mine("mine", "2"))}\n${THEIRS}`,
    );
  });

  it("does not move it twice when the block is written again", () => {
    const once = withMarkedBlock(fileWith(`${mine("mine", "1")}${THEIRS}`), AGN, mine("mine", "2"));
    const twice = withMarkedBlock(once, AGN, mine("mine", "2"));
    expect(twice).toBe(once);
    expect(twice.match(/\[state\."theirs"\]/g)).toHaveLength(1);
  });

  it("does not move one that already sits outside the block byte for byte", () => {
    const both = `${THEIRS}\n${fileWith(`${mine("mine", "1")}${THEIRS}`)}`;
    const written = withMarkedBlock(both, AGN, mine("mine", "1"));
    expect(written.match(/\[state\."theirs"\]/g)).toHaveLength(1);
  });

  it("replaces a table it marked instead of moving it", () => {
    const written = withMarkedBlock(fileWith(mine("mine", "1")), AGN, mine("mine", "2"));
    expect(written).toBe(fileWith(mine("mine", "2")));
  });

  it("drops a marked table it is no longer writing", () => {
    // A trust key whose handler index moved: the row is agn's, so it leaves with the old body.
    const stale = fileWith(`${mine("old", "1")}\n${mine("mine", "1")}`);
    const written = withMarkedBlock(stale, AGN, mine("mine", "2"));
    expect(written).toBe(fileWith(mine("mine", "2")));
    expect(written).not.toContain('[state."old"]');
  });

  it("leaves a table the user wrote outside the block where it is", () => {
    const outside = '[state."theirs"]\nhash = "o"\n\n';
    const written = withMarkedBlock(
      `${outside}# >>> agn begin >>>\n${mine("mine", "1")}# <<< agn end <<<\n`,
      AGN,
      mine("mine", "2"),
    );
    expect(written).toBe(`${outside}# >>> agn begin >>>\n${mine("mine", "2")}# <<< agn end <<<\n`);
  });

  it("adds nothing below the end marker when the block was empty", () => {
    expect(withMarkedBlock(fileWith(""), AGN, mine("mine", "1"))).toBe(fileWith(mine("mine", "1")));
  });

  it("keeps a block that holds nothing but tables agn did not write", () => {
    const written = withMarkedBlock(fileWith(THEIRS), AGN, mine("mine", "1"));
    expect(written).toBe(`${fileWith(mine("mine", "1"))}\n${THEIRS}`);
  });

  it("keeps the user's own lines after the block one blank line below what moved", () => {
    const text = `# >>> agn begin >>>\n${mine("mine", "1")}${THEIRS}# <<< agn end <<<\n[other]\nk = 1\n`;
    expect(withMarkedBlock(text, AGN, mine("mine", "1"))).toBe(
      `# >>> agn begin >>>\n${mine("mine", "1")}# <<< agn end <<<\n\n${THEIRS}\n[other]\nk = 1\n`,
    );
  });

  it("removes the whole block on an empty body, byte for byte", () => {
    // Removal is removal: a table another tool appended inside the block goes with it.
    expect(withoutMarkedBlock(fileWith(`${mine("mine", "1")}${THEIRS}`), AGN)).toBe(
      'notify = ["x"]\n',
    );
  });

  describe("a block an older agn wrote, with no markers in it", () => {
    it("replaces the rows it is writing again and keeps the rest", () => {
      const old = fileWith(`[state."mine"]\nhash = "1"\n${THEIRS}`);
      expect(withMarkedBlock(old, AGN, mine("mine", "2"))).toBe(
        `${fileWith(mine("mine", "2"))}\n${THEIRS}`,
      );
    });

    it("keeps an unmarked row it is no longer writing", () => {
      const old = fileWith('[state."old"]\nhash = "1"\n');
      expect(withMarkedBlock(old, AGN, mine("mine", "1"))).toBe(
        `${fileWith(mine("mine", "1"))}\n[state."old"]\nhash = "1"\n`,
      );
    });
  });

  it("refuses a block that holds the same header twice", () => {
    // Two `[state."mine"]` tables are not valid TOML, so the unmarked one can neither move below
    // the block nor be dropped without losing what the other tool wrote.
    const doubled = fileWith(`${mine("mine", "1")}\n[state."mine"]\nhash = "theirs"\n`);
    expect(() => withMarkedBlock(doubled, AGN, mine("mine", "2"))).toThrow(
      expect.objectContaining({ code: "block-unwritable" }),
    );
  });

  it("moves an unmarked array entry of the same header instead of refusing", () => {
    // `[[hooks]]` may repeat, so Kimi's file stays valid with the foreign entry below the block.
    const ours = `[[hooks]]\n${AGN_TABLE_MARKER}\nevent = "Stop"\n`;
    const theirs = '[[hooks]]\nevent = "Theirs"\n';
    expect(withMarkedBlock(fileWith(`${ours}\n${theirs}`), AGN, ours)).toBe(
      `${fileWith(ours)}\n${theirs}`,
    );
  });
});
