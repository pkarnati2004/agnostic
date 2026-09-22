import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./parse-unified-diff";

const TWO_HUNKS = [
  "diff --git a/src/invite.ts b/src/invite.ts",
  "index 7c3f1a2..9b2d0e4 100644",
  "--- a/src/invite.ts",
  "+++ b/src/invite.ts",
  "@@ -10,4 +10,5 @@ function invite() {",
  ' import { sign } from "./sign";',
  "-  const ttl = 3600;",
  "+  const ttl = readTtl();",
  "+  const now = Date.now();",
  " ",
  "@@ -40,2 +41,2 @@",
  "-  return null;",
  "+  return token;",
  "",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("numbers the old and the new side across two hunks", () => {
    const { hunks, binary } = parseUnifiedDiff(TWO_HUNKS);
    expect(binary).toBe(false);
    expect(hunks).toHaveLength(2);
    const [first, second] = hunks;
    expect(first?.lines.map((line) => [line.kind, line.oldNo, line.newNo])).toEqual([
      ["context", 10, 10],
      ["del", 11, null],
      ["add", null, 11],
      ["add", null, 12],
      ["context", 12, 13],
    ]);
    expect(second?.lines.map((line) => [line.kind, line.oldNo, line.newNo])).toEqual([
      ["del", 40, null],
      ["add", null, 41],
    ]);
  });

  it("keeps the function context a hunk header carries", () => {
    const [first] = parseUnifiedDiff(TWO_HUNKS).hunks;
    expect(first?.header).toBe("@@ -10,4 +10,5 @@ function invite() {");
  });

  it("reads a header with no line counts", () => {
    const { hunks } = parseUnifiedDiff("@@ -1 +1 @@\n-one\n+two\n");
    expect(hunks[0]?.lines.map((line) => [line.oldNo, line.newNo])).toEqual([
      [1, null],
      [null, 1],
    ]);
  });

  it("marks the no-newline note as meta, which numbers nothing", () => {
    const { hunks } = parseUnifiedDiff("@@ -1 +1 @@\n-one\n\\ No newline at end of file\n+two\n");
    expect(hunks[0]?.lines[1]).toEqual({
      kind: "meta",
      oldNo: null,
      newNo: null,
      text: "No newline at end of file",
    });
  });

  it("skips a rename preamble and reads the hunk after it", () => {
    const patch = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 92%",
      "rename from old.ts",
      "rename to new.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-drop",
      "+take",
      "",
    ].join("\n");
    const { hunks } = parseUnifiedDiff(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.lines.map((line) => line.text)).toEqual(["keep", "drop", "take"]);
  });

  it("calls git's binary marker a binary file", () => {
    const patch = [
      "diff --git a/logo.png b/logo.png",
      "index 1a2b3c4..5d6e7f8 100644",
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");
    expect(parseUnifiedDiff(patch)).toEqual({ hunks: [], binary: true });
  });

  it("keeps a CRLF file's lines free of the carriage return", () => {
    const patch = "@@ -1,2 +1,2 @@ head()\r\n one\r\n-two\r\n+two changed\r\n";
    const [hunk] = parseUnifiedDiff(patch).hunks;
    expect(hunk?.header).toBe("@@ -1,2 +1,2 @@ head()");
    expect(hunk?.lines.map((line) => line.text)).toEqual(["one", "two", "two changed"]);
  });

  it("has nothing to draw for an empty patch", () => {
    expect(parseUnifiedDiff("")).toEqual({ hunks: [], binary: false });
  });
});
