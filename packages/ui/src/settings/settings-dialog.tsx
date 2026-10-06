import type { HealthResponse } from "@agnostic/core";
import { DEFAULT_APPEARANCE, DEFAULT_TERMINAL_SIZE } from "@agnostic/core/browser";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { Dialog, DialogContent, DialogTitle } from "../components/dialog";
import type { ConnectionState } from "../store/workspace-state";
import type { AppearanceRoot } from "../styles/appearance-root";
import { watchRootStyle } from "../terminal/watch-root-style";
import { AppearanceSection } from "./appearance-section";
import { DaemonSection } from "./daemon-section";
import { SettingsNav } from "./settings-nav";
import { filterSections, type SettingsSectionId } from "./settings-sections";
import { ShortcutsSection } from "./shortcuts-section";
import { type ConfigState, useConfig } from "./use-config";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: WorkspaceClient;
  root: AppearanceRoot;
  /** The daemon's version and pid for the agnd row, or null until `GET /health` answers. */
  health: HealthResponse | null;
  connection: ConnectionState;
};

/** Every setting with a control behind it, over the workspace. Escape and the X close it. */
export function SettingsDialog(props: SettingsDialogProps) {
  const { config, file, error, patch } = useConfig(props.client, props.root, props.open);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SettingsSectionId>("appearance");
  const sections = filterSections(query);
  // The section the user opened stays open while the query still matches it; otherwise the first
  // match takes over, so typing never leaves the right pane showing something the nav has dropped.
  const active = sections.some((section) => section.id === picked)
    ? picked
    : (sections[0]?.id ?? picked);
  const label = sections.find((section) => section.id === active)?.label ?? "Settings";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[min(760px,100vh-64px)] max-w-[1080px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex min-h-0 overflow-hidden">
          <SettingsNav
            sections={sections}
            active={active}
            query={query}
            onQuery={setQuery}
            onSelect={setPicked}
            file={file}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-11 pt-8 pb-10">
            <h3 className="font-semibold text-[17px]">{label}</h3>
            <Section
              id={active}
              config={config}
              patch={patch}
              health={props.health}
              connection={props.connection}
            />
            {error !== null && (
              <p role="alert" className="mt-4 text-destructive type-meta">
                {error}
              </p>
            )}
            {active !== "shortcuts" && <SaveLine file={file} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SectionProps = Pick<SettingsDialogProps, "health" | "connection"> &
  Pick<ConfigState, "config" | "patch"> & { id: SettingsSectionId };

function Section({ id, config, patch, health, connection }: SectionProps) {
  const scheme = usePageScheme();
  if (id === "shortcuts") {
    return <ShortcutsSection platform={navigator.platform} />;
  }
  if (id === "appearance") {
    return (
      <AppearanceSection
        appearance={config?.appearance ?? DEFAULT_APPEARANCE}
        scheme={scheme}
        onTheme={(theme) => void patch({ appearance: { theme } })}
        onMode={(mode) => void patch({ appearance: { mode } })}
      />
    );
  }
  return (
    <DaemonSection
      health={health}
      connection={connection}
      terminal={config?.terminal ?? { font: null, size: DEFAULT_TERMINAL_SIZE }}
      onFont={(font) => void patch({ terminal: { font } })}
      onSize={(size) => void patch({ terminal: { size } })}
    />
  );
}

function SaveLine({ file }: { file: string | null }) {
  return (
    <p className="mt-8 text-[12px] text-muted-foreground">
      Changes save to <span className="type-mono">{file ?? "config.yaml"}</span> and apply to the
      CLI too.
    </p>
  );
}

/** Which of the two schemes the page is drawn in now: what a card's swatch has to preview. */
function usePageScheme(): "dark" | "light" {
  const [scheme, setScheme] = useState<"dark" | "light">(readScheme);
  useEffect(() => watchRootStyle(document.documentElement, () => setScheme(readScheme())), []);
  return scheme;
}

function readScheme(): "dark" | "light" {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}
