import type { PlanOption, PlanVendor } from "@agnostic/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";

/**
 * The plans the catalog knows, read once a page load and only for a page that has to ask. Detection
 * re-runs every harness, which takes seconds, so a machine where every plan is known never pays for
 * it. `setPlan` writes one vendor's plan into config.yaml and rejects if the daemon refuses.
 */
export function usePlanOptions(client: WorkspaceClient, needed: boolean) {
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (!needed || asked.current) {
      return;
    }
    asked.current = true;
    let live = true;
    client.doctor({}).then(
      (report) => {
        if (live) {
          setOptions(report.planOptions);
        }
      },
      // Detection failed, so agn has nothing to offer: the question keeps its "…" rather than
      // turning a usage cell into an error about a call the user never made.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, needed]);

  const setPlan = useCallback(
    async (vendor: PlanVendor, planId: string) => {
      setBusy(true);
      try {
        setOptions((await client.doctor({ plans: { [vendor]: planId } })).planOptions);
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  return { options, busy, setPlan };
}
