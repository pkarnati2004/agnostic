import type { CatalogSummary } from "@agnostic/core";
import { ClockAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { Button } from "../components/button";
import { HintText } from "../hint-text";
import { catalogStaleLine } from "./catalog-stale";
import { NoticeLine } from "./notice-line";

/**
 * The catalog line, read once per page load and again after an update: nothing here polls. A read
 * that fails says nothing at all - the catalog's age is not worth a second failure on the page.
 */
export function CatalogNotice({
  client,
  now,
  staleDays,
}: {
  client: WorkspaceClient;
  now: number;
  /** `catalog_stale_days` from config.yaml, or its default until `GET /config` answers. */
  staleDays: number;
}) {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void client.catalog().then(
      (response) => {
        if (live) {
          setSummary(response.catalog);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);

  const update = () => {
    setBusy(true);
    setFailure(null);
    void client.updateCatalog().then(
      (response) => {
        setBusy(false);
        setSummary(response.catalog);
      },
      (cause: unknown) => {
        setBusy(false);
        setFailure(asApiError(cause));
      },
    );
  };

  if (failure !== null) {
    return (
      <NoticeLine tone="error">
        {failure.message}
        {failure.hint !== null && (
          <span className="mt-0.5 block text-muted-foreground">
            <HintText hint={failure.hint} />
          </span>
        )}
      </NoticeLine>
    );
  }
  const line = summary === null ? null : catalogStaleLine(summary, now, staleDays);
  if (line === null) {
    return null;
  }
  return (
    <NoticeLine
      tone="warning"
      icon={ClockAlert}
      action={
        <Button variant="ghost" size="sm" disabled={busy} onClick={update}>
          Update now
        </Button>
      }
    >
      <HintText hint={line} />
    </NoticeLine>
  );
}
