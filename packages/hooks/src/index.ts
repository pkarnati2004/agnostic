export { writeStatusLineScript } from "./claude-code/statusline-script.js";
export { HooksError } from "./error.js";
export { hookInstaller, hookParser } from "./harness-hooks.js";
export type { HookEventParser, HookUsage, ParsedHook } from "./hook-event-parser.js";
export type {
  HookInstaller,
  HookInstallInput,
  UserScope,
  UserStatusLine,
  UserStatusLineResult,
} from "./hook-installer.js";
export {
  AGN_TASK_ID,
  hookCommand,
  hookScriptPath,
  rateLimitsFile,
  statusLineScriptPath,
  writeHookScript,
} from "./hook-script.js";
