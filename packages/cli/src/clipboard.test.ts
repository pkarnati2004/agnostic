import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { copyToClipboard } from "./clipboard.js";
import { installCopyShims } from "./test-clipboard.js";
import { createTestContext } from "./test-context.js";

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function copy(tools: string[], platform: NodeJS.Platform) {
  const shims = await installCopyShims(tools);
  dirs.push(shims.dir);
  const { ctx } = createTestContext({ env: { PATH: shims.dir } });
  const copied = await copyToClipboard(ctx, "the description", platform);
  return { copied, shims };
}

describe("copyToClipboard", () => {
  it("hands the text to pbcopy on macOS", async () => {
    const { copied, shims } = await copy(["pbcopy", "xclip"], "darwin");
    expect(copied).toBe(true);
    expect(await shims.received("pbcopy")).toBe("the description");
    expect(await shims.received("xclip")).toBeNull();
  });

  it("prefers wl-copy elsewhere, and falls back to xclip", async () => {
    const wayland = await copy(["wl-copy", "xclip"], "linux");
    expect(await wayland.shims.received("wl-copy")).toBe("the description");
    expect(await wayland.shims.received("xclip")).toBeNull();
    const x11 = await copy(["xclip"], "linux");
    expect(x11.copied).toBe(true);
    expect(await x11.shims.received("xclip")).toBe("the description");
  });

  it("answers false on a machine with no clipboard tool", async () => {
    expect((await copy([], "darwin")).copied).toBe(false);
    expect((await copy([], "linux")).copied).toBe(false);
  });
});
