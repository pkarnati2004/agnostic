import type { Profile } from "@agnostic/core";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  type SelectTriggerSize,
  SelectValue,
} from "../components/select";
import { billingLabel } from "./billing-label";
import { ProfileChip } from "./profile-chip";

export type ProfileSelectProps = {
  id: string;
  /** Every profile the daemon reported; only the available ones are offered. */
  profiles: Profile[];
  value: string | null;
  /** agn's pick, which the list puts first under a heading of its own. */
  recommendedId: string | null;
  /** The card's "Worth trying": a profile this machine could run once something is set. */
  unavailable?: { profileId: string; enable: string } | null;
  onChange: (id: string) => void;
  /** What the trigger reads with nothing picked: "Profile: recommended", or why there is nothing. */
  placeholder: string;
  /** "chip" for the composer's row; the default is the dialog's field-width trigger. */
  size?: SelectTriggerSize;
};

/** Which profile runs the task: agn's pick first and named as the pick, then everything else. */
export function ProfileSelect(props: ProfileSelectProps) {
  const available = props.profiles.filter((profile) => profile.available);
  const recommended = available.find((profile) => profile.id === props.recommendedId) ?? null;
  const rest = available.filter((profile) => profile.id !== recommended?.id);
  const picked = available.find((profile) => profile.id === props.value) ?? null;
  const worthTrying = props.unavailable ?? null;
  return (
    <Select value={props.value ?? undefined} onValueChange={props.onChange}>
      <SelectTrigger id={props.id} aria-label="Profile" size={props.size} mono>
        {picked === null ? (
          <SelectValue placeholder={props.placeholder} />
        ) : (
          <ProfileChip profileId={picked.id} billing={picked.billing} variant="option" />
        )}
      </SelectTrigger>
      <SelectContent>
        {recommended !== null && (
          <SelectGroup>
            <SelectLabel>Recommended</SelectLabel>
            <Option profile={recommended} />
          </SelectGroup>
        )}
        {rest.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your profiles</SelectLabel>
            {rest.map((profile) => (
              <Option key={profile.id} profile={profile} />
            ))}
          </SelectGroup>
        )}
        {worthTrying !== null && (
          <SelectGroup>
            <SelectLabel>Worth trying</SelectLabel>
            {/* Offered so the reader sees what they are missing, and disabled because agn cannot
                run it until the step in `enable` is done. */}
            <SelectItem value={worthTrying.profileId} disabled>
              <span className="flex min-w-0 items-center gap-2">
                <ProfileChip profileId={worthTrying.profileId} variant="option" dim />
                <span className="text-muted-foreground type-meta">needs {worthTrying.enable}</span>
              </span>
            </SelectItem>
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/** The chip, then what the profile costs in the words the usage bar uses. */
function Option({ profile }: { profile: Profile }) {
  const label = billingLabel(profile.billing);
  return (
    <SelectItem value={profile.id}>
      <span className="flex min-w-0 items-center gap-2">
        <ProfileChip profileId={profile.id} variant="option" />
        {label !== null && <span className="text-muted-foreground type-meta">{label}</span>}
      </span>
    </SelectItem>
  );
}
