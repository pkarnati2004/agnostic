import type { EditorId } from "@agnostic/core";

/**
 * One row per editor agn can open a task in, in the order agn prefers them. `command` is the
 * shim the editor installs on PATH, null for the ones that ship none (`xed` exists on a Mac
 * without Xcode, so it is not Xcode's). `apps` are the bundle names, most common first.
 */
export type EditorEntry = {
  id: EditorId;
  name: string;
  command: string | null;
  apps: string[];
};

export const editorList: EditorEntry[] = [
  { id: "vscode", name: "Visual Studio Code", command: "code", apps: ["Visual Studio Code.app"] },
  { id: "cursor", name: "Cursor", command: "cursor", apps: ["Cursor.app"] },
  { id: "zed", name: "Zed", command: "zed", apps: ["Zed.app", "Zed Preview.app"] },
  // The JetBrains IDEs: Toolbox writes each shim under the id's own name.
  {
    id: "idea",
    name: "IntelliJ IDEA",
    command: "idea",
    apps: ["IntelliJ IDEA.app", "IntelliJ IDEA CE.app"],
  },
  { id: "webstorm", name: "WebStorm", command: "webstorm", apps: ["WebStorm.app"] },
  { id: "pycharm", name: "PyCharm", command: "pycharm", apps: ["PyCharm.app", "PyCharm CE.app"] },
  { id: "goland", name: "GoLand", command: "goland", apps: ["GoLand.app"] },
  { id: "rustrover", name: "RustRover", command: "rustrover", apps: ["RustRover.app"] },
  { id: "clion", name: "CLion", command: "clion", apps: ["CLion.app"] },
  { id: "phpstorm", name: "PhpStorm", command: "phpstorm", apps: ["PhpStorm.app"] },
  { id: "rubymine", name: "RubyMine", command: "rubymine", apps: ["RubyMine.app"] },
  { id: "xcode", name: "Xcode", command: null, apps: ["Xcode.app"] },
  { id: "iterm", name: "iTerm", command: null, apps: ["iTerm.app"] },
  { id: "terminal", name: "Terminal", command: null, apps: ["Terminal.app"] },
];
