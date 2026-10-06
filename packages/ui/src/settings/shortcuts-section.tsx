import { paletteHint } from "../sidebar/shortcut-hint";

/** What the workspace answers to today. The palette's own hint decides the modifier's glyph. */
function shortcuts(platform: string): { label: string; keys: string[] }[] {
  return [
    { label: "Command palette", keys: [paletteHint(platform)] },
    { label: "Start task", keys: [platform.startsWith("Mac") ? "⌘↵" : "Ctrl ↵"] },
    { label: "Task row menu", keys: ["⇧F10"] },
    { label: "Close", keys: ["⎋"] },
  ];
}

/** A list, not a form: nothing here is rebindable yet, and the first line says so. */
export function ShortcutsSection({ platform }: { platform: string }) {
  return (
    <>
      <p className="mt-1.5 text-muted-foreground type-meta">Shortcuts can't be changed yet.</p>
      <div className="mt-4 overflow-hidden rounded-[10px] border border-border bg-sidebar">
        {shortcuts(platform).map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 border-border border-b px-3.5 py-2.5 last:border-b-0"
          >
            <span className="flex-1">{row.label}</span>
            {row.keys.map((key) => (
              <kbd
                key={key}
                className="inline-flex h-[22px] items-center rounded-[5px] border border-input bg-muted px-1.5 text-[11.5px] type-mono"
              >
                {key}
              </kbd>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
