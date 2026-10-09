import type { EditorsResponse } from "@agnostic/core";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";

/**
 * The editors this machine has, read once: they belong to the machine, not to a task or a dialog.
 * A failed read stays null, which is what a machine with no editor looks like to a caller.
 */
export function useEditors(client: WorkspaceClient): EditorsResponse | null {
  const [editors, setEditors] = useState<EditorsResponse | null>(null);
  useEffect(() => {
    let live = true;
    void client.editors().then(
      (response) => {
        if (live) {
          setEditors(response);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);
  return editors;
}
