/**
 * What the Search row shows as the palette's shortcut. Display only: the shortcut itself accepts
 * either modifier (`palette/palette-shortcut.ts`), so this never decides what a key does.
 */
export function paletteHint(platform: string): string {
  return platform.startsWith("Mac") ? "⌘K" : "Ctrl K";
}
