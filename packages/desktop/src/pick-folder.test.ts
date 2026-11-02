import { describe, expect, it, vi } from "vitest";
import { PickFolderRequestSchema, pickFolderHandler } from "./pick-folder.js";

const ORIGIN = "http://127.0.0.1:7555";
const PAGE = `${ORIGIN}/ui`;

function handler(answer: { canceled: boolean; filePaths: string[] }) {
  const showOpenDialog = vi.fn(async () => answer);
  return { showOpenDialog, pick: pickFolderHandler({ daemonOrigin: ORIGIN, showOpenDialog }) };
}

describe("pickFolderHandler", () => {
  it("refuses a sender that is not the daemon's page, before any dialog", async () => {
    const { pick, showOpenDialog } = handler({ canceled: false, filePaths: ["/x"] });
    await expect(pick("https://example.com/", {})).rejects.toThrow(/may not open/);
    await expect(pick("http://127.0.0.1:7431/ui", {})).rejects.toThrow(/may not open/);
    await expect(pick(undefined, {})).rejects.toThrow(/may not open/);
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it("refuses a body it does not know", async () => {
    const { pick } = handler({ canceled: false, filePaths: ["/x"] });
    await expect(pick(PAGE, { defaultPath: 3 })).rejects.toThrow();
    await expect(pick(PAGE, { other: true })).rejects.toThrow();
  });

  it("answers null for Cancel", async () => {
    const { pick } = handler({ canceled: true, filePaths: [] });
    expect(await pick(PAGE, undefined)).toBeNull();
  });

  it("answers the first path and forwards defaultPath", async () => {
    const { pick, showOpenDialog } = handler({ canceled: false, filePaths: ["/a", "/b"] });
    expect(await pick(PAGE, { defaultPath: "/Users/dev/code" })).toBe("/a");
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: "Choose a folder",
      buttonLabel: "Choose",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: "/Users/dev/code",
    });
  });
});

describe("PickFolderRequestSchema", () => {
  it("takes an empty body or a non-empty defaultPath, and nothing else", () => {
    expect(PickFolderRequestSchema.safeParse({}).success).toBe(true);
    expect(PickFolderRequestSchema.safeParse({ defaultPath: "/x" }).success).toBe(true);
    expect(PickFolderRequestSchema.safeParse({ defaultPath: "" }).success).toBe(false);
  });
});
