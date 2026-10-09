import type { DoctorRequest, DoctorResponse, Plan, PlanVendor } from "@agnostic/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";

export type DoctorState = {
  /** Null until the first answer lands, which is what the rows read as "Checking…". */
  report: DoctorResponse | null;
  busy: boolean;
  error: string | null;
  recheck(): Promise<void>;
  setPlan(vendor: PlanVendor, plan: Plan): Promise<void>;
};

/**
 * `POST /doctor` shells out to every harness, so the dialog asks once: the first section that needs
 * it sends the call and the answer is kept, so switching between Agents, Plans and Daemon
 * re-detects nothing. Recheck and a plan pick ask again and replace it. The answer outlives a
 * close, which is why the Agents header prints when it was taken and offers Recheck beside it.
 */
export function useDoctor(client: WorkspaceClient, wanted: boolean): DoctorState {
  const [report, setReport] = useState<DoctorResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set as the call goes out, so two sections wanting it in one render still send one.
  const asked = useRef(false);

  const send = useCallback(
    async (body: DoctorRequest) => {
      asked.current = true;
      setBusy(true);
      setError(null);
      try {
        setReport(await client.doctor(body));
      } catch (cause: unknown) {
        setError(asApiError(cause).message);
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (wanted && !asked.current) {
      void send({});
    }
  }, [wanted, send]);

  const recheck = useCallback(() => send({}), [send]);
  const setPlan = useCallback(
    (vendor: PlanVendor, plan: Plan) => send({ plans: { [vendor]: plan } }),
    [send],
  );

  return { report, busy, error, recheck, setPlan };
}
