import type { CatalogSummary } from "@agnostic/core";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import { Button } from "../components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { formatElapsed } from "../time/elapsed";
import { PerRepoLine } from "./per-repo-line";
import { SettingsRow } from "./settings-row";

/** What the design offers: a day for a machine that wants the newest scores, a month for one that does not. */
const STALE_DAYS = [1, 3, 7, 14, 30];

type RecommendationsSectionProps = {
  client: WorkspaceClient;
  /** Null until `GET /config` answers. */
  staleDays: number | null;
  onStaleDays: (days: number) => void;
};

export function RecommendationsSection(props: RecommendationsSectionProps) {
  const catalog = useCatalog(props.client);
  return (
    <>
      <div className="mt-3.5 flex flex-col">
        <SettingsRow
          label="Benchmark catalog"
          description={
            <>
              Scores used to rank profiles. Same as{" "}
              <span className="type-mono">agn catalog update</span>.
            </>
          }
        >
          <span className="flex items-center gap-4">
            <span className="text-muted-foreground type-meta">{catalog.line}</span>
            <Button variant="outline" size="sm" disabled={catalog.busy} onClick={catalog.update}>
              <RefreshCw aria-hidden className="size-3.5" />
              {catalog.busy ? "Syncing…" : "Sync now"}
            </Button>
          </span>
        </SettingsRow>
        {catalog.outcome !== null && (
          <p className="pb-2 text-muted-foreground type-meta">{catalog.outcome}</p>
        )}
        <SettingsRow
          label="Mark catalog stale after"
          description="Shows a notice above the terminal when the catalog is older than this."
        >
          <Select
            value={props.staleDays === null ? undefined : String(props.staleDays)}
            onValueChange={(value) => props.onStaleDays(Number(value))}
          >
            <SelectTrigger className="w-[160px]" aria-label="Mark catalog stale after">
              <SelectValue placeholder="7 days" />
            </SelectTrigger>
            <SelectContent>
              {dayOptions(props.staleDays).map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {`${days} ${days === 1 ? "day" : "days"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
      <PerRepoLine>
        Risk review rules are per repo in <span className="type-mono">.ag/preferences.yaml</span>.
      </PerRepoLine>
    </>
  );
}

/** A window set by hand in config.yaml is offered too, so picking another never hides it. */
function dayOptions(days: number | null): number[] {
  if (days === null || STALE_DAYS.includes(days)) {
    return STALE_DAYS;
  }
  return [...STALE_DAYS, days].sort((a, b) => a - b);
}

/** Which catalog the daemon serves and how old its last check is, read when the section opens. */
function useCatalog(client: WorkspaceClient) {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void client.catalog().then(
      (response) => {
        if (live) {
          setSummary(response.catalog);
        }
      },
      (cause: unknown) => {
        if (live) {
          setOutcome(asApiError(cause).message);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [client]);

  const update = () => {
    setBusy(true);
    setOutcome(null);
    void client.updateCatalog().then(
      (response) => {
        setBusy(false);
        setSummary(response.catalog);
        setOutcome(
          response.update.outcome === "updated"
            ? `Updated to v${response.update.remoteVersion}`
            : "Already current",
        );
      },
      (cause: unknown) => {
        setBusy(false);
        setOutcome(asApiError(cause).message);
      },
    );
  };

  return { line: catalogLine(summary), busy, outcome, update };
}

function catalogLine(summary: CatalogSummary | null): string {
  if (summary === null) {
    return "Checking…";
  }
  const last = summary.lastCheck;
  if (last === null) {
    return `v${summary.version} · never checked`;
  }
  if (last.outcome === "failed") {
    return `v${summary.version} · last check failed`;
  }
  return `v${summary.version} · checked ${formatElapsed(last.checkedAt, Date.now())} ago`;
}
