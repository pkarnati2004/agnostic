import { join } from "node:path";
import { type Editor, isDirectory } from "@agnostic/core";
import { findOnPath } from "./detect-binary.js";
import { type EditorEntry, editorList } from "./editor-list.js";

export type DetectEditorsOptions = {
  env: Record<string, string>;
  home: string;
  /** Injected by tests; app bundles exist on macOS only. */
  platform?: NodeJS.Platform;
  appDirs?: string[];
};

/**
 * Which editors this machine has, in `editorList` order. It is a scan of PATH and of the app
 * folders and nothing else: an editor is never run to find out whether it is there.
 */
export async function detectEditors(opts: DetectEditorsOptions): Promise<Editor[]> {
  const dirs = (opts.platform ?? process.platform) === "darwin" ? appDirsFor(opts) : [];
  const found: Editor[] = [];
  for (const entry of editorList) {
    const editor = (await onPath(entry, opts.env.PATH ?? "")) ?? (await inAppDirs(entry, dirs));
    if (editor !== null) {
      found.push(editor);
    }
  }
  return found;
}

/**
 * A PATH shim is launched directly; an app bundle goes to the system opener by its own path, not
 * its name, so the copy that opens is the copy detection found.
 */
export function editorCommand(editor: Editor, dir: string): string[] {
  return editor.via === "path" ? [editor.path, dir] : ["open", "-a", editor.path, dir];
}

async function onPath(entry: EditorEntry, pathVar: string): Promise<Editor | null> {
  if (entry.command === null) {
    return null;
  }
  const path = await findOnPath([entry.command], pathVar);
  return path === null ? null : { id: entry.id, name: entry.name, via: "path", path };
}

// A shim on PATH is the editor the user set up themselves, so it wins over any bundle on disk.
async function inAppDirs(entry: EditorEntry, dirs: string[]): Promise<Editor | null> {
  for (const dir of dirs) {
    for (const app of entry.apps) {
      const path = join(dir, app);
      if (await isDirectory(path)) {
        return { id: entry.id, name: entry.name, via: "app", path };
      }
    }
  }
  return null;
}

/** The folders a Mac keeps applications in; `detect-design-tools.ts` scans the same ones. */
export function appDirsFor(opts: DetectEditorsOptions): string[] {
  return (
    opts.appDirs ?? [
      "/Applications",
      join(opts.home, "Applications"),
      // Toolbox installs its IDEs here rather than in /Applications.
      join(opts.home, "Applications", "JetBrains Toolbox"),
      // Where macOS keeps Terminal.app.
      "/System/Applications/Utilities",
    ]
  );
}
