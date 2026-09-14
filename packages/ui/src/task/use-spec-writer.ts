import type { SpecRequest, SpecResponse } from "@agnostic/core";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";

type SpecWriterState = {
  busy: boolean;
  /** A machine with no eligible agent (409) or an agent that did not answer (502). */
  error: ApiError | null;
  writtenBy: string | null;
  /** The fields stay out of the way until a spec arrives, a call fails, or the user asks for them. */
  shown: boolean;
};

export type SpecWriter = SpecWriterState & {
  write: (repoId: string, body: SpecRequest) => void;
  show: () => void;
};

const IDLE: SpecWriterState = { busy: false, error: null, writtenBy: null, shown: false };

/**
 * The Write spec call and what the dialog shows around it. Nothing is started by it: the answer
 * fills three fields the user edits before Run (ADR 028), and a failure opens them empty rather
 * than blocking the dialog, because the spec is optional.
 */
export function useSpecWriter(input: {
  client: WorkspaceClient;
  open: boolean;
  onWritten: (spec: SpecResponse) => void;
}): SpecWriter {
  const [state, setState] = useState<SpecWriterState>(IDLE);
  // `state.busy` is a render away from the second of two clicks in the same tick; the ref is not.
  const busy = useRef(false);
  // Each open of the dialog is a session, so an answer to a call from an earlier one is dropped
  // rather than landing in the fresh form.
  const session = useRef(0);
  useEffect(() => {
    if (input.open) {
      session.current += 1;
      busy.current = false;
      setState(IDLE);
    }
  }, [input.open]);

  const write = (repoId: string, body: SpecRequest) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    const opened = session.current;
    const live = () => session.current === opened;
    setState((current) => ({ ...current, busy: true, error: null }));
    input.client.writeSpec(repoId, body).then(
      (spec) => {
        if (!live()) {
          return;
        }
        busy.current = false;
        setState({ busy: false, error: null, writtenBy: spec.profileId, shown: true });
        input.onWritten(spec);
      },
      (cause: unknown) => {
        if (!live()) {
          return;
        }
        busy.current = false;
        // The fields still hold the spec an earlier call wrote, so they keep its attribution.
        setState((current) => ({
          busy: false,
          error: asApiError(cause),
          writtenBy: current.writtenBy,
          shown: true,
        }));
      },
    );
  };

  return { ...state, write, show: () => setState((current) => ({ ...current, shown: true })) };
}
