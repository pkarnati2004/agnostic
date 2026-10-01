import { join } from "node:path";
import { type DesignTool, isDirectory } from "@agnostic/core";
import { type DesignToolEntry, designToolList } from "./design-tool-list.js";
import { appDirsFor, type DetectEditorsOptions } from "./detect-editors.js";

/**
 * Which design tools this machine can open, in `designToolList` order. Every row is reported:
 * a tool with no app bundle on disk is opened at its own address instead, so a machine with
 * nothing installed can still start a design task.
 */
export async function detectDesignTools(opts: DetectEditorsOptions): Promise<DesignTool[]> {
  const dirs = (opts.platform ?? process.platform) === "darwin" ? appDirsFor(opts) : [];
  const found: DesignTool[] = [];
  for (const entry of designToolList) {
    const tool = (await inAppDirs(entry, dirs)) ?? onWeb(entry);
    if (tool !== null) {
      found.push(tool);
    }
  }
  return found;
}

/**
 * The tool is opened with no directory argument: neither tool documents taking one, and the
 * system opener would hand it a document the app cannot read. The folder is printed instead.
 */
export function designToolCommand(tool: DesignTool): string[] {
  return tool.via === "app" ? ["open", "-a", tool.path] : ["open", tool.path];
}

async function inAppDirs(entry: DesignToolEntry, dirs: string[]): Promise<DesignTool | null> {
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

function onWeb(entry: DesignToolEntry): DesignTool | null {
  return entry.url === null
    ? null
    : { id: entry.id, name: entry.name, via: "url", path: entry.url };
}
