import type { DoctorResponse, HarnessReport, Profile } from "@agnostic/core";

/** An installed, logged-in harness whose models were probed: what the table's happy row reads. */
export function harnessReport(over: Partial<HarnessReport> = {}): HarnessReport {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/opt/bin/claude",
    version: "2.0.1",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    support: "full",
    models: ["sonnet-4.5"],
    modelSource: "probe",
    planVendor: "claude",
    limitSource: "statusline",
    usageSource: "transcripts",
    plan: { value: "max20", source: "detected", known: true, confirmed: true, overridden: null },
    limitCapture: "all-sessions",
    ...over,
  };
}

export const DOCTOR_PROFILE: Profile = {
  id: "claude-code:default:native",
  harness: "claude-code",
  model: null,
  route: "native",
  billing: "subscription",
  available: true,
  evidence: "binary",
  tier: 1,
};

/** What a daemon that found one machine's worth of agents answers `POST /doctor` with. */
export function doctorResponse(over: Partial<DoctorResponse> = {}): DoctorResponse {
  return {
    harnesses: [],
    profiles: [DOCTOR_PROFILE],
    tools: [],
    named: [],
    detectedAt: "2026-09-11T10:00:00.000Z",
    pathVar: "/opt/bin",
    plans: {},
    tmuxConfigStale: false,
    keys: [],
    tmux: { version: "3.4", ok: true },
    planOptions: [
      { vendor: "claude", id: "pro", displayName: "Pro" },
      { vendor: "claude", id: "max20", displayName: "Max 20x" },
    ],
    ...over,
  };
}
