import type { MachineConfig } from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import type { AppearanceRoot } from "../styles/appearance-root";

/**
 * config.yaml as the page reads it, once, on mount. The daemon has the last word on the theme: the
 * page paints from its own mirror before React renders, and this replaces that with what the file
 * says as soon as it answers. A read that fails leaves the mirror's theme up and the config null,
 * so the catalog notice and the New task tab keep their own defaults.
 */
export function useMachineConfig(
  client: WorkspaceClient,
  root: AppearanceRoot,
): { config: MachineConfig | null; setConfig: (config: MachineConfig) => void } {
  const [config, setConfig] = useState<MachineConfig | null>(null);
  useEffect(() => {
    let live = true;
    void client.config().then(
      (answer) => {
        if (!live) {
          return;
        }
        root.apply(answer.config.appearance);
        root.applyTerminal(answer.config.terminal);
        setConfig(answer.config);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, root]);
  return { config, setConfig };
}
