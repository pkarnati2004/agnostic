import { z } from "zod";

/**
 * The editors agn can open a task in, in the order it prefers them. One id per JetBrains IDE
 * rather than a family id with a sub-key, so `--editor webstorm` reads the way a user says it;
 * iTerm and Terminal are editors too, because "open this task" means the same thing for them.
 */
export const EditorIdSchema = z.enum([
  "vscode",
  "cursor",
  "zed",
  "idea",
  "webstorm",
  "pycharm",
  "goland",
  "rustrover",
  "clion",
  "phpstorm",
  "rubymine",
  "xcode",
  "iterm",
  "terminal",
]);
export type EditorId = z.infer<typeof EditorIdSchema>;

/** One editor found on this machine: `path` is the binary for "path" and the .app for "app". */
export type Editor = {
  id: EditorId;
  name: string;
  via: "path" | "app";
  path: string;
};
