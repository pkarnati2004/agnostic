import type {
  Appearance,
  ConfigPatchRequest,
  ConfigResponse,
  MachineConfig,
  TerminalConfig,
} from "@agnostic/core";
import { DEFAULT_APPEARANCE, DEFAULT_TERMINAL_SIZE } from "@agnostic/core/browser";
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import type { AppearanceRoot } from "../styles/appearance-root";

export type ConfigState = {
  config: MachineConfig | null;
  /** The path of config.yaml, which the nav footer and the save line both print. */
  file: string | null;
  error: string | null;
  patch(body: ConfigPatchRequest): Promise<void>;
};

/**
 * config.yaml as the dialog sees it. The read happens when the dialog opens, so a file edited by
 * hand between two opens is the file the second one shows. A patch paints first and sends second:
 * a theme pick has to land before the round trip, and a refusal leaves what was painted on screen
 * with the daemon's message under the row that asked.
 */
export function useConfig(
  client: WorkspaceClient,
  root: AppearanceRoot,
  open: boolean,
): ConfigState {
  const [response, setResponse] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let live = true;
    setError(null);
    client.config().then(
      (answer) => {
        if (live) {
          setResponse(answer);
        }
      },
      (cause: unknown) => {
        if (live) {
          setError(asApiError(cause).message);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [client, open]);

  const patch = useCallback(
    async (body: ConfigPatchRequest) => {
      const current = response?.config ?? null;
      root.apply(appearanceOf(body, current));
      root.applyTerminal(terminalOf(body, current));
      setError(null);
      try {
        const answer = await client.patchConfig(body);
        setResponse(answer);
        root.apply(answer.config.appearance);
        root.applyTerminal(answer.config.terminal);
      } catch (cause: unknown) {
        setError(asApiError(cause).message);
      }
    },
    [client, root, response],
  );

  return { config: response?.config ?? null, file: response?.file ?? null, error, patch };
}

/** What the page should be painted as the moment the click lands: the body over what is on file. */
function appearanceOf(body: ConfigPatchRequest, current: MachineConfig | null): Appearance {
  const base = current?.appearance ?? DEFAULT_APPEARANCE;
  return {
    theme: body.appearance?.theme ?? base.theme,
    mode: body.appearance?.mode ?? base.mode,
  };
}

function terminalOf(body: ConfigPatchRequest, current: MachineConfig | null): TerminalConfig {
  const base = current?.terminal ?? { font: null, size: DEFAULT_TERMINAL_SIZE };
  return {
    font: body.terminal?.font === undefined ? base.font : body.terminal.font,
    size: body.terminal?.size ?? base.size,
  };
}
