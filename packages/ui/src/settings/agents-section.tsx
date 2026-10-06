import type { Profile } from "@agnostic/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { billingLabel } from "../profile/billing-label";
import { HarnessMark } from "../profile/harness-mark";
import { profileParts } from "../profile/profile-parts";
import { DetectedAgents } from "./detected-agents";
import { PerRepoLine } from "./per-repo-line";
import { SettingsBox, SettingsBoxRow } from "./settings-box";
import { SettingsGroupHeading, SettingsRow } from "./settings-row";
import type { DoctorState } from "./use-doctor";

/** The select's value for "let agn choose", which config.yaml writes as no `spec_writer` at all. */
const CHEAPEST = "cheapest";

type AgentsSectionProps = {
  doctor: DoctorState;
  /** The page's `GET /profiles` list, so the Spec writer select works before detection finishes. */
  profiles: Profile[];
  /** Null until `GET /config` answers. */
  specWriter: string | null;
  onSpecWriter: (id: string | null) => void;
};

export function AgentsSection(props: AgentsSectionProps) {
  return (
    <>
      <SettingsGroupHeading
        title="Detected agents"
        description={
          <>
            Coding agents found on this computer. Same check as{" "}
            <span className="type-mono">agn doctor</span>.
          </>
        }
      />
      <DetectedAgents
        report={props.doctor.report}
        busy={props.doctor.busy}
        onRecheck={() => void props.doctor.recheck()}
      />
      <SettingsGroupHeading
        title="Profiles"
        description="A profile is a harness, a model and a route. Recommendations choose among these."
      />
      <ProfilesBox profiles={props.profiles} />
      <PerRepoLine>
        Default profile is set per repo in <span className="type-mono">.ag/agnostic.yaml</span>.
      </PerRepoLine>
      <div className="mt-4 flex flex-col">
        <SettingsRow
          label="Spec writer"
          description='Writes the spec and acceptance list when "Write the spec first" is on. A fast, cheap model works best.'
        >
          <SpecWriterSelect
            specWriter={props.specWriter}
            profiles={props.profiles}
            onSpecWriter={props.onSpecWriter}
          />
        </SettingsRow>
      </div>
    </>
  );
}

/** Read-only: a profile comes from what this machine has, so there is nothing here to edit. */
function ProfilesBox({ profiles }: { profiles: Profile[] }) {
  return (
    <SettingsBox>
      {profiles.length === 0 && (
        <SettingsBoxRow>
          <span className="text-muted-foreground">
            No profiles yet. Install an agent and run a recheck.
          </span>
        </SettingsBoxRow>
      )}
      {profiles.map((profile) => {
        const billing = billingLabel(profile.billing);
        return (
          <SettingsBoxRow key={profile.id}>
            <HarnessMark harness={profile.harness} />
            <span className="min-w-0 flex-1 truncate type-mono">
              {`${profile.harness} · ${profile.model ?? "default"}`}
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground type-mono">
              {profile.route}
            </span>
            {billing !== null && (
              <span className="shrink-0 text-muted-foreground type-meta">{billing}</span>
            )}
          </SettingsBoxRow>
        );
      })}
    </SettingsBox>
  );
}

function SpecWriterSelect({
  specWriter,
  profiles,
  onSpecWriter,
}: Pick<AgentsSectionProps, "specWriter" | "profiles" | "onSpecWriter">) {
  const ids = options(specWriter, profiles);
  return (
    <Select
      value={specWriter ?? CHEAPEST}
      onValueChange={(value) => onSpecWriter(value === CHEAPEST ? null : value)}
    >
      <SelectTrigger className="w-[260px]" aria-label="Spec writer">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CHEAPEST}>Cheapest covered model</SelectItem>
        {ids.map((id) => (
          <SelectItem key={id} value={id}>
            <HarnessMark harness={profileParts(id).harness} />
            <span className="type-mono">{id}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** An id set by hand that this machine cannot run is still offered, so picking another never hides it. */
function options(specWriter: string | null, profiles: Profile[]): string[] {
  const ids = profiles.filter((profile) => profile.available).map((profile) => profile.id);
  if (specWriter === null || ids.includes(specWriter)) {
    return ids;
  }
  return [specWriter, ...ids];
}
