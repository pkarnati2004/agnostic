import { useEffect } from "react";
import type { WorkspaceClient } from "../api/client";
import type { AppearanceRoot } from "../styles/appearance-root";

/**
 * The daemon has the last word on the theme: the page paints from its own mirror before React
 * renders, and this replaces that with what config.yaml says as soon as it answers. A read that
 * fails leaves the mirror's theme up, which is the one this browser drew last.
 */
export function useAppearanceSync(client: WorkspaceClient, root: AppearanceRoot): void {
  useEffect(() => {
    let live = true;
    void client.config().then(
      (answer) => {
        if (!live) {
          return;
        }
        root.apply(answer.config.appearance);
        root.applyTerminal(answer.config.terminal);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, root]);
}
