import type { BudgetReport, Profile, RepoListRow, Task } from "@agnostic/core";
import { FolderGit2, Laptop } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { cn } from "../class-names";
import { FailureNotice } from "../notice/failure-notice";
import { Composer } from "./composer";
import { contextLine } from "./context-line";
import { DetectedLine } from "./detected-line";
import {
  followRecommendation,
  type NewTaskForm,
  recommendRequest,
  runRequest,
  specRequest,
} from "./new-task-request";
import { NewTaskStarter } from "./new-task-starter";
import { RecommendationCard } from "./recommendation-card";
import { SpecStep } from "./spec-step";
import { useRecommendation } from "./use-recommendation";
import { useSpecWriter } from "./use-spec-writer";

export type NewTaskTabProps = {
  repos: RepoListRow[];
  /** The repo of the tab in front, else the first one in the sidebar. */
  defaultRepoId: string | null;
  profiles: Profile[];
  /** The machine's spend against config.yaml's ceilings, null until the usage bar has read one. */
  budget: BudgetReport | null;
  /** What the prompt starts as, from the palette's "Run: <prompt>"; a new `at` re-seeds the tab. */
  seed: { prompt: string; at: number } | null;
  client: WorkspaceClient;
  onStarted: (task: Task) => void;
  onAddRepo: () => void;
  /** "empty" draws the display heading and the first-run actions; "tab" is the New task tab. */
  mode: "empty" | "tab";
  /** False while another tab is in front: the tab stays mounted, so the draft survives the switch. */
  active: boolean;
};

/** Describe the work, see agn's pick, keep it or change it, start. Read a spec first if you ask. */
export function NewTaskTab(props: NewTaskTabProps) {
  const task = useNewTask(props);
  return (
    <div
      hidden={!props.active}
      // The attribute alone loses to the `flex` this layout needs, so a class hides it as well.
      className={cn(
        "min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto p-8",
        props.active ? "flex" : "hidden",
      )}
    >
      {props.mode === "empty" && <NewTaskStarter repos={props.repos} onAddRepo={props.onAddRepo} />}
      <div className="flex w-full min-w-0 max-w-[620px] flex-col gap-3">
        {task.step === "compose" ? (
          <ComposeStep props={props} task={task} />
        ) : (
          <WriteStep props={props} task={task} />
        )}
        {task.step === "compose" &&
          (task.state.recommendation !== null || task.state.error !== null) && (
            <RecommendationCard state={task.state} profiles={props.profiles} />
          )}
        {task.error !== null && (
          <FailureNotice error={task.error} className="rounded-lg border-b-0 px-3 py-2" />
        )}
        {task.busy && task.repo?.testCommand != null && (
          <p className="px-1.5 text-muted-foreground type-meta">
            Running the tests first: {task.repo.testCommand}
          </p>
        )}
        <ContextRow repo={task.repo} profiles={props.profiles} />
      </div>
    </div>
  );
}

type StepProps = { props: NewTaskTabProps; task: NewTask };

/** The prompt and the four things worth saying about it before anything starts. */
function ComposeStep({ props, task }: StepProps) {
  return (
    <Composer
      form={task.form}
      onChange={task.setForm}
      repos={props.repos}
      profiles={props.profiles}
      budget={props.budget}
      recommendation={task.state}
      profileId={task.profileId}
      onPickProfile={task.pickProfile}
      writeSpec={task.writeSpec}
      onWriteSpec={task.setWriteSpec}
      canStart={task.canStart}
      busy={task.busy}
      onStart={task.writeSpec ? task.write : task.run}
      onChooseRepo={props.onAddRepo}
      promptRef={task.promptRef}
      active={props.active}
    />
  );
}

/** The spec the switch asked for: still nothing started, and every field the user's to change. */
function WriteStep({ props, task }: StepProps) {
  return (
    <SpecStep
      prompt={task.form.prompt}
      draft={task.form}
      onChange={(draft) => task.setForm({ ...task.form, ...draft })}
      writtenBy={task.writer.writtenBy}
      busy={task.writer.busy || task.busy}
      error={task.writer.error}
      profile={props.profiles.find((profile) => profile.id === task.profileId) ?? null}
      onBack={() => task.setStep("compose")}
      onRewrite={task.write}
      onApprove={task.run}
    />
  );
}

/** Each part of the context line with the icon the design gives it; the repo's name carries none. */
const CONTEXT_PARTS = [
  { place: "machine", Icon: Laptop },
  { place: "repo", Icon: null },
  { place: "checkout", Icon: FolderGit2 },
] as const;

/** Where the task would run, and which agents this machine has to run it with. */
function ContextRow({ repo, profiles }: { repo: RepoListRow | null; profiles: Profile[] }) {
  const words = contextLine(repo);
  return (
    <div className="flex flex-wrap items-center gap-3.5 px-1.5 text-muted-foreground type-meta">
      {CONTEXT_PARTS.map(({ place, Icon }, index) => (
        <span key={place} className="flex items-center gap-1.5">
          {Icon !== null && <Icon aria-hidden className="size-3" />}
          {words[index]}
        </span>
      ))}
      <span className="flex-1" />
      <DetectedLine profiles={profiles} />
    </div>
  );
}

type NewTask = ReturnType<typeof useNewTask>;

/** Everything the two steps share: the form, agn's pick for it, the spec writer, and the run. */
function useNewTask(props: NewTaskTabProps) {
  const { form, setForm, touched, setTouched } = useNewTaskForm(props.defaultRepoId, props.seed);
  const [step, setStep] = useState<"compose" | "spec">("compose");
  const [writeSpec, setWriteSpec] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const state = useRecommendation(props.client, recommendRequest(form));
  const profileId = followRecommendation(
    form.profileId,
    touched,
    state.recommendation,
    props.profiles.filter((profile) => profile.available),
  );
  const body = runRequest({ ...form, profileId });
  const spec = specRequest(form);
  const { run, busy, error } = useRunTask(props, form.repoId, body);
  const writer = useSpecWriter({
    client: props.client,
    onWritten: (written) =>
      setForm((current) => ({
        ...current,
        title: written.title,
        spec: written.spec,
        acceptance: written.acceptance ?? "",
      })),
  });
  return {
    form,
    setForm,
    step,
    setStep,
    writeSpec,
    setWriteSpec,
    promptRef,
    state,
    profileId,
    repo: props.repos.find((row) => row.id === form.repoId) ?? null,
    busy,
    error,
    writer,
    canStart: !busy && !writer.busy && (writeSpec ? spec !== null : body !== null),
    run,
    // The step is entered before the answer lands, so the fields fill in where they are read.
    write: () => {
      if (spec !== null) {
        setStep("spec");
        writer.write(form.repoId, spec);
      }
    },
    pickProfile: (picked: string) => {
      setTouched(true);
      setForm({ ...form, profileId: picked });
    },
  };
}

/**
 * The run the arrow and Approve both make. Leaving the tab does not cancel one already on its way
 * to the daemon: the task arrives through the feed whether or not this tab is still open.
 */
function useRunTask(props: NewTaskTabProps, repoId: string, body: ReturnType<typeof runRequest>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = () => {
    if (body === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    props.client.runTask(repoId, body).then(
      ({ task }) => {
        setBusy(false);
        props.onStarted(task);
      },
      (cause: unknown) => {
        setBusy(false);
        setError(asApiError(cause));
      },
    );
  };
  return { run, busy, error };
}

/** A blank form, and a fresh one whenever the palette hands the tab another prompt. */
function useNewTaskForm(defaultRepoId: string | null, seed: NewTaskTabProps["seed"]) {
  const [state, setState] = useState<NewTaskForm>(() => blank(defaultRepoId, seed));
  const [touched, setTouched] = useState(false);
  const seeded = useRef(seed?.at ?? null);
  useEffect(() => {
    const at = seed?.at ?? null;
    if (at === seeded.current) {
      return;
    }
    seeded.current = at;
    setState(blank(defaultRepoId, seed));
    setTouched(false);
  }, [seed, defaultRepoId]);
  // The repo list lands after the first render, so an untouched form takes the default when it does.
  const form = state.repoId === "" ? { ...state, repoId: defaultRepoId ?? "" } : state;
  return { form, setForm: setState, touched, setTouched };
}

function blank(repoId: string | null, seed: NewTaskTabProps["seed"]): NewTaskForm {
  return {
    repoId: repoId ?? "",
    prompt: seed?.prompt ?? "",
    intent: "automatic",
    profileId: null,
    title: "",
    spec: "",
    acceptance: "",
    ignoreBudget: false,
  };
}
