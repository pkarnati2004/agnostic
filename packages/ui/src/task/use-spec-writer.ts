import type { SpecRequest, SpecResponse } from "@agnostic/core";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";

type SpecWriterState = {
  busy: boolean;
  /** A machine with no eligible agent (409) or an agent that did not answer (502). */
  error: ApiError | null;
  writtenBy: string | null;
};

export type SpecWriter = SpecWriterState & {
  write: (repoId: string, body: SpecRequest) => void;
};

const IDLE: SpecWriterState = { busy: false, error: null, writtenBy: null };

/**
 * The Write spec call and what the step shows around it. Nothing is started by it: the answer fills
 * three fields the user edits before Approve and start (ADR 028), and a failure leaves those fields
 * empty with the daemon's words above the footer, because the spec is optional.
 */
export function useSpecWriter(input: {
  client: WorkspaceClient;
  onWritten: (spec: SpecResponse) => void;
}): SpecWriter {
  const [state, setState] = useState<SpecWriterState>(IDLE);
  // `state.busy` is a render away from the second of two clicks in the same tick; the ref is not.
  const busy = useRef(false);
  // An answer to a call made by a tab that has since closed has nowhere to land.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const write = (repoId: string, body: SpecRequest) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setState((current) => ({ ...current, busy: true, error: null }));
    input.client.writeSpec(repoId, body).then(
      (spec) => {
        busy.current = false;
        if (!mounted.current) {
          return;
        }
        setState({ busy: false, error: null, writtenBy: spec.profileId });
        input.onWritten(spec);
      },
      (cause: unknown) => {
        busy.current = false;
        if (!mounted.current) {
          return;
        }
        // The fields still hold the spec an earlier call wrote, so they keep its attribution.
        setState((current) => ({
          busy: false,
          error: asApiError(cause),
          writtenBy: current.writtenBy,
        }));
      },
    );
  };

  return { ...state, write };
}
