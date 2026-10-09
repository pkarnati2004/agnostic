import { keyHint } from "../sidebar/shortcut-hint";

/** What the workspace answers to, in the order the design lists them. */
const SHORTCUTS: { label: string; keys: string }[] = [
  { label: "Command palette", keys: "⌘K" },
  { label: "Start task", keys: "⌘↵" },
  { label: "Hand off", keys: "⌘⇧H" },
  { label: "Toggle sidebar", keys: "⌘\\" },
  { label: "Toggle Changes", keys: "⌘⇧C" },
  { label: "Next tab", keys: "⌃⇥" },
  { label: "Task row menu", keys: "⇧F10" },
  { label: "Close", keys: "⎋" },
];

/** A list, not a form: nothing here is rebindable yet, and the first line says so. */
export function ShortcutsSection({ platform }: { platform: string }) {
  return (
    <>
      <p className="mt-1.5 text-muted-foreground type-meta">Shortcuts can't be changed yet.</p>
      <div className="mt-4 overflow-hidden rounded-[10px] border border-border bg-sidebar">
        {SHORTCUTS.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 border-border border-b px-3.5 py-2.5 last:border-b-0"
          >
            <span className="flex-1">{row.label}</span>
            <kbd className="inline-flex h-[22px] items-center rounded-[5px] border border-input bg-muted px-1.5 text-[11.5px] type-mono">
              {keyHint(platform, row.keys)}
            </kbd>
          </div>
        ))}
      </div>
    </>
  );
}
