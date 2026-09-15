import type { Profile, RepoListRow, RunTaskRequest, Task } from "@agnostic/core";
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { Button } from "../components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";
import { NewTaskFields } from "./new-task-form";
import {
  followRecommendation,
  type NewTaskForm,
  recommendRequest,
  runRequest,
} from "./new-task-request";
import { useRecommendation } from "./use-recommendation";

type NewTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: RepoListRow[];
  /** The repo of the tab in front, else the first one in the sidebar. */
  defaultRepoId: string | null;
  profiles: Profile[];
  client: WorkspaceClient;
  onStarted: (task: Task) => void;
};

/** Describe the work, see agn's pick, keep it or change it, run. */
export function NewTaskDialog(props: NewTaskDialogProps) {
  const { form, setForm, touched, setTouched } = useNewTaskForm(props.open, props.defaultRepoId);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const state = useRecommendation(props.client, recommendRequest(form));
  const profiles = props.profiles.filter((profile) => profile.available);
  const profileId = followRecommendation(form.profileId, touched, state.recommendation, profiles);
  const body = runRequest({ ...form, profileId });
  const repo = props.repos.find((row) => row.id === form.repoId) ?? null;
  const { run, busy, error } = useRunTask(props, form.repoId, body);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Taller than a 13-inch window once the card fills out, so the fields scroll and Run stays. */}
      <DialogContent
        className="max-h-[88vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]"
        onOpenAutoFocus={focusPrompt(prompt)}
      >
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            agn picks the agent and model for the prompt; change it before you run if you disagree.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <NewTaskFields
            repos={props.repos}
            profiles={profiles}
            form={form}
            onChange={setForm}
            profileId={profileId}
            onPickProfile={(picked) => {
              setTouched(true);
              setForm({ ...form, profileId: picked });
            }}
            state={state}
            promptRef={prompt}
            onRunShortcut={(event) => {
              if (runsNow(event)) {
                run();
              }
            }}
          />
        </div>
        <RunFooter
          error={error}
          testing={busy ? (repo?.testCommand ?? null) : null}
          disabled={body === null || busy}
          onRun={run}
        />
      </DialogContent>
    </Dialog>
  );
}

type RunFooterProps = {
  error: ApiError | null;
  /** The repo's test command while it runs, which is what a slow start is waiting on (ADR 022). */
  testing: string | null;
  disabled: boolean;
  onRun: () => void;
};

function RunFooter({ error, testing, disabled, onRun }: RunFooterProps) {
  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <div>
          <p className="text-destructive text-sm">{error.message}</p>
          {error.hint !== null && (
            <p className="mt-1 text-muted-foreground text-xs">{error.hint}</p>
          )}
        </div>
      )}
      {testing !== null && (
        <p className="text-muted-foreground text-xs">Running the tests first: {testing}</p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button size="sm" onClick={onRun} disabled={disabled}>
          Run
        </Button>
      </DialogFooter>
    </div>
  );
}

/** The prompt is what the dialog is for, so it takes the focus rather than the first select. */
function focusPrompt(prompt: RefObject<HTMLTextAreaElement | null>) {
  return (event: Event) => {
    event.preventDefault();
    // Without preventScroll the fields scroll to the prompt and the repo select opens out of sight.
    prompt.current?.focus({ preventScroll: true });
  };
}

/** Enter writes a newline, as it does in every other prompt box; Cmd or Ctrl with it runs. */
function runsNow(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
    return false;
  }
  event.preventDefault();
  return true;
}

/**
 * The run the Run button makes. Closing the dialog does not cancel one already on its way to the
 * daemon: the task arrives through the feed whether or not this dialog is still open.
 */
function useRunTask(props: NewTaskDialogProps, repoId: string, body: RunTaskRequest | null) {
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
        props.onOpenChange(false);
      },
      (cause: unknown) => {
        setBusy(false);
        setError(asApiError(cause));
      },
    );
  };
  return { run, busy, error };
}

/** Every open starts from nothing but the repo the user was last looking at. */
function useNewTaskForm(open: boolean, defaultRepoId: string | null) {
  const [form, setForm] = useState<NewTaskForm>(() => blank(defaultRepoId));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(blank(defaultRepoId));
      setTouched(false);
    }
  }, [open, defaultRepoId]);
  return { form, setForm, touched, setTouched };
}

function blank(repoId: string | null): NewTaskForm {
  return { repoId: repoId ?? "", prompt: "", intent: "automatic", profileId: null };
}
