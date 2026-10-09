import type { ApiKeyReport, Plan, PlanOption, PlanVendor } from "@agnostic/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";
import { VendorMark } from "../profile/harness-mark";
import { SettingsBox, SettingsBoxRow } from "./settings-box";
import { SettingsGroupHeading, SettingsRow } from "./settings-row";
import { SettingsStatus } from "./settings-status";
import type { DoctorState } from "./use-doctor";

/** The two vendors that sell a plan agn measures usage against, in the order the design draws them. */
const VENDOR_ROWS: { vendor: PlanVendor; label: string; description: string }[] = [
  {
    vendor: "claude",
    label: "Claude plan",
    description: "The usage bar measures against this plan's limits.",
  },
  { vendor: "chatgpt", label: "ChatGPT plan", description: "Used for codex limits." },
];

export function PlansSection({ doctor }: { doctor: DoctorState }) {
  const report = doctor.report;
  return (
    <>
      <div className="mt-3.5 flex flex-col">
        {VENDOR_ROWS.map((row) => (
          <SettingsRow key={row.vendor} label={row.label} description={row.description}>
            <PlanSelect
              vendor={row.vendor}
              label={row.label}
              options={report?.planOptions ?? []}
              value={report?.plans[row.vendor] ?? null}
              onPlan={(plan) => void doctor.setPlan(row.vendor, plan)}
            />
          </SettingsRow>
        ))}
      </div>
      <SettingsGroupHeading
        title="API keys"
        description="Read from the environment agnd was started in. agnostic shows whether a key is set, never its value."
      />
      <KeysBox keys={report?.keys ?? null} />
      <p className="mt-2.5 text-[12px] text-muted-foreground">
        Export the variable where agnd starts, then restart it (
        <span className="type-mono">agn daemon restart</span> from a terminal).
      </p>
    </>
  );
}

function PlanSelect({
  vendor,
  label,
  options,
  value,
  onPlan,
}: {
  vendor: PlanVendor;
  label: string;
  options: PlanOption[];
  value: Plan | null;
  onPlan: (plan: Plan) => void;
}) {
  const own = options.filter((option) => option.vendor === vendor);
  return (
    <Select value={value ?? undefined} onValueChange={onPlan} disabled={own.length === 0}>
      <SelectTrigger className="w-[220px]" aria-label={label}>
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent>
        {own.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <VendorMark vendor={vendor} />
            {option.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Presence only. The daemon answers with a boolean per variable, so there is no value on this page
 * to show, copy or leak - and no button either: a key is set in the shell that starts agnd.
 */
function KeysBox({ keys }: { keys: ApiKeyReport[] | null }) {
  return (
    <SettingsBox>
      {keys === null && (
        <SettingsBoxRow>
          <span className="text-muted-foreground">Checking…</span>
        </SettingsBoxRow>
      )}
      {keys?.map((key) => (
        <SettingsBoxRow key={key.name}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="type-mono">{key.name}</span>
            <span className="text-muted-foreground type-meta">{`Used by ${key.usedBy.join(", ")}`}</span>
          </span>
          {key.set ? (
            <SettingsStatus tone="running">Set in environment</SettingsStatus>
          ) : (
            <SettingsStatus tone="absent">Not set</SettingsStatus>
          )}
        </SettingsBoxRow>
      ))}
    </SettingsBox>
  );
}
