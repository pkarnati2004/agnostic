import type { HealthResponse, MachineConfig, Profile } from "@agnostic/core";
import { DEFAULT_APPEARANCE, DEFAULT_TERMINAL_SIZE } from "@agnostic/core/browser";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { Dialog, DialogContent, DialogTitle } from "../components/dialog";
import { useEditors } from "../store/use-editors";
import type { ConnectionState } from "../store/workspace-state";
import type { AppearanceRoot } from "../styles/appearance-root";
import { watchRootStyle } from "../terminal/watch-root-style";
import { AgentsSection } from "./agents-section";
import { AppearanceSection } from "./appearance-section";
import { DaemonSection } from "./daemon-section";
import { PlansSection } from "./plans-section";
import { RecommendationsSection } from "./recommendations-section";
import { SettingsNav } from "./settings-nav";
import { filterSections, needsDoctor, type SettingsSectionId } from "./settings-sections";
import { ShortcutsSection } from "./shortcuts-section";
import { TasksSection } from "./tasks-section";
import { type ConfigState, useConfig } from "./use-config";
import { type DoctorState, useDoctor } from "./use-doctor";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: WorkspaceClient;
  root: AppearanceRoot;
  /** The daemon's version, pid and home, or null until `GET /health` answers. */
  health: HealthResponse | null;
  connection: ConnectionState;
  /** The page's profile list: the Profiles box and the Spec writer select both read it. */
  profiles: Profile[];
  /** Every answer the dialog gets, so the page's own copy of config.yaml follows a change. */
  onConfig: (config: MachineConfig) => void;
};

/** Every setting with a control behind it, over the workspace. Escape and the X close it. */
export function SettingsDialog(props: SettingsDialogProps) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SettingsSectionId>("appearance");
  const sections = filterSections(query);
  // The section the user opened stays open while the query still matches it; otherwise the first
  // match takes over, so typing never leaves the right pane showing something the nav has dropped.
  const active = sections.some((section) => section.id === picked)
    ? picked
    : (sections[0]?.id ?? picked);
  const label = sections.find((section) => section.id === active)?.label ?? "Settings";
  const config = useConfig(props.client, props.root, props.open, props.onConfig);
  const doctor = useDoctor(props.client, props.open && needsDoctor(active));
  // Whichever call last refused, under the section that asked, as 33a does for a PATCH.
  const error = config.error ?? doctor.error;

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
            file={config.file}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-11 pt-8 pb-10">
            <h3 className="font-semibold text-[17px]">{label}</h3>
            <Section id={active} props={props} config={config} doctor={doctor} />
            {error !== null && (
              <p role="alert" className="mt-4 text-destructive type-meta">
                {error}
              </p>
            )}
            {active !== "shortcuts" && <SaveLine file={config.file} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SectionProps = {
  id: SettingsSectionId;
  props: SettingsDialogProps;
  config: ConfigState;
  doctor: DoctorState;
};

function Section({ id, props, config, doctor }: SectionProps) {
  const scheme = usePageScheme();
  const editors = useEditors(props.client);
  const { patch } = config;
  switch (id) {
    case "shortcuts":
      return <ShortcutsSection platform={navigator.platform} />;
    case "appearance":
      return (
        <AppearanceSection
          appearance={config.config?.appearance ?? DEFAULT_APPEARANCE}
          scheme={scheme}
          onTheme={(theme) => void patch({ appearance: { theme } })}
          onMode={(mode) => void patch({ appearance: { mode } })}
        />
      );
    case "agents":
      return (
        <AgentsSection
          doctor={doctor}
          profiles={props.profiles}
          specWriter={config.config?.specWriter ?? null}
          onSpecWriter={(specWriter) => void patch({ specWriter })}
        />
      );
    case "plans":
      return <PlansSection doctor={doctor} />;
    case "recommendations":
      return (
        <RecommendationsSection
          client={props.client}
          staleDays={config.config?.catalogStaleDays ?? null}
          onStaleDays={(catalogStaleDays) => void patch({ catalogStaleDays })}
        />
      );
    case "tasks":
      return (
        <TasksSection
          health={props.health}
          editors={editors}
          editor={config.config?.editor ?? null}
          onEditor={(editor) => void patch({ editor })}
          specFirst={config.config?.specFirst ?? null}
          onSpecFirst={(specFirst) => void patch({ specFirst })}
        />
      );
    case "daemon":
      return (
        <DaemonSection
          health={props.health}
          connection={props.connection}
          terminal={config.config?.terminal ?? { font: null, size: DEFAULT_TERMINAL_SIZE }}
          onFont={(font) => void patch({ terminal: { font } })}
          onSize={(size) => void patch({ terminal: { size } })}
          report={doctor.report}
          file={config.file}
          claudeStatusline={config.config?.hooks.claudeStatusline ?? null}
          onClaudeStatusline={(claudeStatusline) => void patch({ hooks: { claudeStatusline } })}
        />
      );
  }
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
