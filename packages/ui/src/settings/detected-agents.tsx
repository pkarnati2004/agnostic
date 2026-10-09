import type { HarnessReport } from "@agnostic/core";
import { RefreshCw } from "lucide-react";
import { Button } from "../components/button";
import { HarnessMark } from "../profile/harness-mark";
import { formatElapsed } from "../time/elapsed";
import { SettingsBox, SettingsBoxRow } from "./settings-box";
import { SettingsStatus } from "./settings-status";

type DetectedAgentsProps = {
  /** Null while the first `POST /doctor` is still out. */
  report: { harnesses: HarnessReport[]; detectedAt: string } | null;
  busy: boolean;
  onRecheck: () => void;
};

/**
 * The same table `agn doctor` prints: every harness agn integrates, plus any other one that is
 * installed. A harness that is not on PATH keeps its row, because knowing it is missing is the
 * answer the reader came for.
 */
export function DetectedAgents({ report, busy, onRecheck }: DetectedAgentsProps) {
  const rows = report === null ? [] : reported(report.harnesses);
  const installed = rows.filter((row) => row.path !== null).length;
  return (
    <SettingsBox>
      <SettingsBoxRow muted>
        <span className="flex-1">
          {report === null
            ? "Checking…"
            : `${installed} of ${rows.length} found · ${checked(report.detectedAt)}`}
        </span>
        <Button variant="outline" size="sm" disabled={busy} onClick={onRecheck}>
          <RefreshCw aria-hidden className="size-3.5" />
          {busy ? "Checking…" : "Recheck"}
        </Button>
      </SettingsBoxRow>
      {rows.map((row) => (
        <SettingsBoxRow key={row.harness}>
          <HarnessMark harness={row.harness} />
          <span className="type-mono">{row.harness}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground type-mono">
            {row.path === null ? "" : `${row.version ?? "unknown"} · ${row.path}`}
          </span>
          {row.path === null ? (
            <SettingsStatus tone="absent">Not on PATH</SettingsStatus>
          ) : (
            <SettingsStatus tone="running">Installed</SettingsStatus>
          )}
        </SettingsBoxRow>
      ))}
    </SettingsBox>
  );
}

/** What `agn doctor` tabulates: every tier-1 harness, and a tier-2 one only once it is installed. */
function reported(harnesses: HarnessReport[]): HarnessReport[] {
  return harnesses.filter((row) => row.tier === 1 || row.path !== null);
}

/** The sidebar's own relative time, with the word a reader expects for a check a moment old. */
function checked(detectedAt: string): string {
  const since = formatElapsed(detectedAt, Date.now());
  return since === "0m" ? "checked just now" : `checked ${since} ago`;
}
