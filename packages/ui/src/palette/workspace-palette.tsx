import type { RunTaskRequest, Task } from "@agnostic/core";
import { useCallback, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { CommandPalette } from "./command-palette";
import type { PaletteContext, PaletteHandlers } from "./palette-commands";
import { usePaletteShortcut } from "./palette-shortcut";

type WorkspacePaletteProps = {
  client: WorkspaceClient;
  context: Omit<PaletteContext, "query">;
  handlers: Omit<PaletteHandlers, "recommend">;
  onStarted: (task: Task) => void;
};

/** The palette as the page wires it: the shortcut that opens it and the two calls it makes. */
export function WorkspacePalette({ client, onStarted, ...props }: WorkspacePaletteProps) {
  const [open, setOpen] = useState(false);
  usePaletteShortcut(useCallback(() => setOpen((was) => !was), []));

  // No signal to abort with: the palette asks once, on Enter, rather than on every keystroke.
  const recommend = useCallback(
    async (repoId: string, prompt: string) => {
      const answer = await client.recommend(
        { repoId, prompt, dryRun: true },
        new AbortController().signal,
      );
      return answer.recommendation;
    },
    [client],
  );

  const runOn = useCallback(
    async (repoId: string, body: RunTaskRequest) => {
      onStarted((await client.runTask(repoId, body)).task);
    },
    [client, onStarted],
  );

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      context={props.context}
      handlers={props.handlers}
      recommend={recommend}
      runOn={runOn}
    />
  );
}
