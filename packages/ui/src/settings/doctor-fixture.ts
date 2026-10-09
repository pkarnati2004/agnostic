import type { DoctorResponse, HarnessReport, Profile } from "@agnostic/core";
import { doctorResponse } from "../usage/usage-response.fixture";
import type { DoctorState } from "./use-doctor";

export function harnessReport(over: Partial<HarnessReport> = {}): HarnessReport {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/opt/homebrew/bin/claude",
    version: "2.4.1",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    support: "full",
    models: [],
    modelSource: "none",
    planVendor: "claude",
    limitSource: null,
    usageSource: "transcripts",
    plan: null,
    limitCapture: "all-sessions",
    ...over,
  };
}

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "claude-code:fable:native",
    harness: "claude-code",
    model: "fable",
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
    ...over,
  };
}

/** A settled doctor state: the sections read it, so a test gives it the answer it wants. */
export function doctorState(over: Partial<DoctorResponse> | null = {}): DoctorState {
  return {
    report: over === null ? null : doctorResponse(over),
    busy: false,
    error: null,
    recheck: () => Promise.resolve(),
    setPlan: () => Promise.resolve(),
  };
}
