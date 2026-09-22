import type { EditorId, EditorsResponse } from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../components/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";

type OpenInEditorProps = {
  /** Null while `GET /editors` has not answered; the button waits rather than naming an editor. */
  editors: EditorsResponse | null;
  disabled: boolean;
  onOpen: (editor: EditorId | null) => void;
};

/**
 * Open in <editor>, with the rest of the machine's editors behind the chevron. The button sends no
 * editor at all, so the daemon picks the configured one (ADR 023).
 */
export function OpenInEditor({ editors, disabled, onOpen }: OpenInEditorProps) {
  // The Select holds the last pick, and picking the same editor twice must open it twice; a new
  // key gives it a fresh one to hold each time.
  const [round, setRound] = useState(0);
  const found = editors?.editors ?? [];
  const chosen = found.find((editor) => editor.id === editors?.default) ?? found[0] ?? null;
  const none = editors !== null && found.length === 0;

  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || editors === null || none}
      onClick={() => onOpen(null)}
      className={found.length > 1 ? "rounded-r-none" : ""}
    >
      {chosen === null ? "Open in editor" : `Open in ${chosen.name}`}
    </Button>
  );

  return (
    <div className="flex items-center">
      {none ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>No editor found. Run `agn doctor`.</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      {found.length > 1 && (
        <Select
          key={round}
          onValueChange={(id) => {
            setRound((count) => count + 1);
            const editor = found.find((one) => one.id === id);
            if (editor !== undefined) {
              onOpen(editor.id);
            }
          }}
        >
          {/* No SelectValue: the trigger is the chevron, and what it opens is not a field. */}
          <SelectTrigger
            aria-label="Choose an editor"
            disabled={disabled}
            className="h-8 w-7 justify-center rounded-l-none border-l-0 px-0"
          />
          <SelectContent>
            {found.map((editor) => (
              <SelectItem key={editor.id} value={editor.id}>
                {editor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
