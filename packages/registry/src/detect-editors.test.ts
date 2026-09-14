import { fileURLToPath } from "node:url";
import { type Editor, type EditorId, EditorIdSchema, setProcessLog } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { detectEditors, editorCommand } from "./detect-editors.js";
import { editorList } from "./editor-list.js";

const BIN = fileURLToPath(new URL("../../../tests/fixtures/bin", import.meta.url));
const APPS = fileURLToPath(new URL("../../../tests/fixtures/apps", import.meta.url));
const SYSTEM_APPS = fileURLToPath(new URL("../../../tests/fixtures/apps-system", import.meta.url));

function detect(opts: { path?: string; appDirs?: string[]; platform?: NodeJS.Platform } = {}) {
  return detectEditors({
    env: { PATH: opts.path ?? "" },
    home: "/home/nobody",
    platform: opts.platform ?? "darwin",
    appDirs: opts.appDirs ?? [],
  });
}

function ids(editors: Editor[]): EditorId[] {
  return editors.map((editor) => editor.id);
}

describe("editorList", () => {
  it("covers every editor id exactly once, in the schema's order", () => {
    expect(editorList.map((entry) => entry.id)).toEqual(EditorIdSchema.options);
  });
});

describe("detectEditors", () => {
  it("finds an editor by its shim on PATH", async () => {
    expect(await detect({ path: `${BIN}/editors` })).toEqual([
      { id: "vscode", name: "Visual Studio Code", via: "path", path: `${BIN}/editors/code` },
    ]);
  });

  it("finds an editor by its app bundle when no shim is installed", async () => {
    const cursor = (await detect({ appDirs: [APPS] })).find((editor) => editor.id === "cursor");
    expect(cursor).toEqual({
      id: "cursor",
      name: "Cursor",
      via: "app",
      path: `${APPS}/Cursor.app`,
    });
  });

  it("returns the editors in table order, however they were found", async () => {
    expect(ids(await detect({ path: `${BIN}/editors`, appDirs: [APPS, SYSTEM_APPS] }))).toEqual([
      "vscode",
      "cursor",
      "zed",
      "webstorm",
      "xcode",
      "iterm",
      "terminal",
    ]);
  });

  it("counts Zed Preview as Zed", async () => {
    const zed = (await detect({ appDirs: [APPS] })).find((editor) => editor.id === "zed");
    expect(zed?.path).toBe(`${APPS}/Zed Preview.app`);
  });

  it("prefers the shim on PATH over the app bundle of the same editor", async () => {
    const dir = `${BIN}/editors`;
    const vscode = (await detect({ path: dir, appDirs: [APPS] }))[0];
    expect(vscode).toMatchObject({ id: "vscode", via: "path", path: `${dir}/code` });
  });

  it("ignores app folders off macOS, where there are none", async () => {
    expect(await detect({ appDirs: [APPS, SYSTEM_APPS], platform: "linux" })).toEqual([]);
  });

  it("finds nothing with an empty PATH and no app folders", async () => {
    expect(await detect()).toEqual([]);
  });

  it("never runs an editor to find out that it is installed", async () => {
    const commands: string[] = [];
    setProcessLog((entry) => commands.push(entry.command));
    try {
      await detect({ path: `${BIN}/editors`, appDirs: [APPS, SYSTEM_APPS] });
    } finally {
      setProcessLog(null);
    }
    expect(commands).toEqual([]);
  });
});

describe("editorCommand", () => {
  it("runs a PATH shim with the directory as its only argument", () => {
    const editor: Editor = { id: "vscode", name: "VS Code", via: "path", path: "/usr/bin/code" };
    expect(editorCommand(editor, "/work/api")).toEqual(["/usr/bin/code", "/work/api"]);
  });

  it("hands the system opener the bundle detection found, not its name", () => {
    const editor: Editor = { id: "zed", name: "Zed", via: "app", path: "/Applications/Zed.app" };
    expect(editorCommand(editor, "/work/api")).toEqual([
      "open",
      "-a",
      "/Applications/Zed.app",
      "/work/api",
    ]);
  });
});
