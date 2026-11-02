import { describe, expect, it } from "vitest";
import { PICK_FOLDER_CHANNEL, RECHECK_CHANNEL } from "./ipc-channels.js";

describe("ipc-channels", () => {
  it("names both channels, distinct and namespaced", () => {
    expect(PICK_FOLDER_CHANNEL).toBe("agnostic:pick-folder");
    expect(RECHECK_CHANNEL).toBe("agnostic:recheck");
    expect(PICK_FOLDER_CHANNEL).not.toBe(RECHECK_CHANNEL);
  });
});
