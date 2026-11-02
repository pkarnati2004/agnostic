import { CoreError } from "@agnostic/core";
import { z } from "zod";

export const PickFolderRequestSchema = z
  .object({ defaultPath: z.string().min(1).optional() })
  .strict();

type OpenDialogOptions = {
  title: string;
  buttonLabel: string;
  properties: ("openDirectory" | "createDirectory")[];
  defaultPath?: string;
};

/**
 * The main side of `window.agnostic.pickFolder`. Only the daemon's own page may ask: a frame from
 * anywhere else is refused before a dialog opens. The answer is a path or null for Cancel.
 */
export function pickFolderHandler(deps: {
  daemonOrigin: string;
  showOpenDialog: (opts: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
}): (senderUrl: string | undefined, raw: unknown) => Promise<string | null> {
  return async (senderUrl, raw) => {
    if (senderUrl === undefined || originOf(senderUrl) !== deps.daemonOrigin) {
      throw new CoreError(`${senderUrl ?? "an unknown frame"} may not open the folder picker`, {
        code: "desktop-sender-refused",
        hint: "Only the workspace page served by agnd can ask for a folder.",
      });
    }
    const request = PickFolderRequestSchema.parse(raw ?? {});
    const picked = await deps.showOpenDialog({
      title: "Choose a folder",
      buttonLabel: "Choose",
      properties: ["openDirectory", "createDirectory"],
      ...(request.defaultPath === undefined ? {} : { defaultPath: request.defaultPath }),
    });
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    // A sender with no parseable URL is not the daemon's page.
    return null;
  }
}
