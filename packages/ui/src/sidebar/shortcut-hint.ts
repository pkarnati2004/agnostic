/**
 * What a shortcut reads as on this platform. Display only: every binding that takes ⌘ takes Ctrl
 * too (`shortcuts/workspace-shortcuts.ts`, `palette/palette-shortcut.ts`), so this never decides
 * what a key does. ⌘ and ⌃ both read "Ctrl " off macOS; the other glyphs are the same everywhere.
 */
export function keyHint(platform: string, keys: string): string {
  if (platform.startsWith("Mac")) {
    return keys;
  }
  return keys.replace("⌘", "Ctrl ").replace("⌃", "Ctrl ");
}

/** The Search row's own hint, which is the palette's shortcut. */
export function paletteHint(platform: string): string {
  return keyHint(platform, "⌘K");
}
