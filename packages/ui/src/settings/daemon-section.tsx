import type { HealthResponse } from "@agnostic/core";
import { DEFAULT_TERMINAL_SIZE, type TerminalConfig } from "@agnostic/core/browser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import type { ConnectionState } from "../store/workspace-state";
import { SettingsGroupHeading, SettingsRow } from "./settings-row";
import { TERMINAL_FONTS, TERMINAL_SIZES } from "./terminal-options";

/** The select's own value for "no family of its own", which config.yaml writes as no key at all. */
const PAGE_MONO = "system";

type DaemonSectionProps = {
  health: HealthResponse | null;
  connection: ConnectionState;
  terminal: TerminalConfig;
  onFont: (font: string | null) => void;
  onSize: (size: number) => void;
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
    </>
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
  const colour = live ? "var(--status-running)" : "var(--status-failed)";
  return (
    <span className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 type-meta" style={{ color: colour }}>
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: colour }} />
        {live ? "Running" : "Not running"}
      </span>
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
