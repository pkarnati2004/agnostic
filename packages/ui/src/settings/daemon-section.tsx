import type { DoctorResponse, HealthResponse } from "@agnostic/core";
import { DEFAULT_TERMINAL_SIZE, type TerminalConfig } from "@agnostic/core/browser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import type { ConnectionState } from "../store/workspace-state";
import { DaemonCommands } from "./daemon-commands";
import { SettingsGroupHeading, SettingsRow } from "./settings-row";
import { SettingsStatus } from "./settings-status";
import { TERMINAL_FONTS, TERMINAL_SIZES } from "./terminal-options";

/** The select's own value for "no family of its own", which config.yaml writes as no key at all. */
const PAGE_MONO = "system";

/** `user` is every Claude Code session on this machine; `repo` only the ones agn starts. */
const STATUSLINE_SCOPES = [
  { value: "user", label: "All sessions" },
  { value: "repo", label: "agn tasks only" },
] as const;

type DaemonSectionProps = {
  health: HealthResponse | null;
  connection: ConnectionState;
  terminal: TerminalConfig;
  onFont: (font: string | null) => void;
  onSize: (size: number) => void;
  /** Null while the first `POST /doctor` is still out: the tmux row reads "Checking…" meanwhile. */
  report: DoctorResponse | null;
  /** The path of config.yaml, which the Commands block's last row copies. */
  file: string | null;
  claudeStatusline: "user" | "repo" | null;
  onClaudeStatusline: (scope: "user" | "repo") => void;
};

export function DaemonSection(props: DaemonSectionProps) {
  return (
    <>
      <div className="mt-3.5 flex flex-col">
        <SettingsRow
          label={<span className="type-mono-lg">agnd</span>}
          description="Runs agents in tmux and keeps their state when this window closes."
        >
          <DaemonStatus health={props.health} connection={props.connection} />
        </SettingsRow>
        <SettingsRow
          label={<span className="type-mono-lg">tmux</span>}
          description="Version 3.3 or newer is needed for reliable reattach."
        >
          <TmuxStatus report={props.report} />
        </SettingsRow>
        {props.report?.tmuxConfigStale === true && (
          <p className="pb-3 text-muted-foreground type-meta">
            The running tmux server predates agn's current settings. Stop every task or run{" "}
            <span className="type-mono">tmux -L agn kill-server</span>.
          </p>
        )}
        <SettingsRow
          label="Claude Code status line"
          description="Where agn installs the command that reports the plan's rate limit. Applies on the next task launch or `agn hooks install`."
        >
          <Select
            value={props.claudeStatusline ?? undefined}
            onValueChange={(value) => props.onClaudeStatusline(value === "repo" ? "repo" : "user")}
          >
            <SelectTrigger className="w-[220px]" aria-label="Claude Code status line">
              <SelectValue placeholder="All sessions" />
            </SelectTrigger>
            <SelectContent>
              {STATUSLINE_SCOPES.map((scope) => (
                <SelectItem key={scope.value} value={scope.value}>
                  {scope.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
      <SettingsGroupHeading
        title="Terminal"
        description="Agent output keeps its own colors and layout. Only the font changes."
      />
      <div className="mt-1 flex flex-col">
        <SettingsRow label="Font">
          <Select
            value={props.terminal.font ?? PAGE_MONO}
            onValueChange={(value) => props.onFont(value === PAGE_MONO ? null : value)}
          >
            <SelectTrigger className="w-[220px]" aria-label="Terminal font">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PAGE_MONO}>System mono</SelectItem>
              {fontOptions(props.terminal.font).map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Size">
          <Select
            value={String(props.terminal.size)}
            onValueChange={(value) => props.onSize(Number(value))}
          >
            <SelectTrigger className="w-[120px]" aria-label="Terminal font size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizeOptions(props.terminal.size).map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {`${size} px`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
      <DaemonCommands file={props.file} />
    </>
  );
}

/** What `tmux -V` answered, against the floor reattach needs rather than the launch floor. */
function TmuxStatus({ report }: { report: DoctorResponse | null }) {
  if (report === null) {
    return <span className="text-muted-foreground type-meta">Checking…</span>;
  }
  const { version, ok } = report.tmux;
  return (
    <span className="flex items-center gap-4">
      {version !== null && <span className="text-muted-foreground type-mono">{version}</span>}
      {version === null ? (
        <SettingsStatus tone="failed">Not found</SettingsStatus>
      ) : (
        <SettingsStatus tone={ok ? "running" : "failed"}>{ok ? "OK" : "Too old"}</SettingsStatus>
      )}
    </span>
  );
}

/** Whether agnd is answering, and which one: the same two states the sidebar footer shows. */
function DaemonStatus({
  health,
  connection,
}: {
  health: HealthResponse | null;
  connection: ConnectionState;
}) {
  const live = connection === "live";
  return (
    <span className="flex items-center gap-4">
      <SettingsStatus tone={live ? "running" : "failed"}>
        {live ? "Running" : "Not running"}
      </SettingsStatus>
      {live && health !== null && (
        <span className="text-muted-foreground type-mono">
          {`v${health.version} · pid ${health.pid}`}
        </span>
      )}
    </span>
  );
}

/** A family set by hand in config.yaml is offered too, so picking another never hides it. */
function fontOptions(font: string | null): string[] {
  if (font === null || TERMINAL_FONTS.includes(font)) {
    return TERMINAL_FONTS;
  }
  return [font, ...TERMINAL_FONTS];
}

function sizeOptions(size: number): number[] {
  if (TERMINAL_SIZES.includes(size) || size === DEFAULT_TERMINAL_SIZE) {
    return TERMINAL_SIZES;
  }
  return [size, ...TERMINAL_SIZES].sort((a, b) => a - b);
}
