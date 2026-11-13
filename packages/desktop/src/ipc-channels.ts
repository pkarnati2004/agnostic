// The preloads run sandboxed, where `require` reaches electron and little else, so they import
// these names from a file that imports nothing rather than from the modules that handle them.

/** `window.agnostic.pickFolder`, handled by `pickFolderHandler`. */
export const PICK_FOLDER_CHANNEL = "agnostic:pick-folder";

/** The status page's "Check again" and "Try again": run the start sequence once more. */
export const RECHECK_CHANNEL = "agnostic:recheck";
