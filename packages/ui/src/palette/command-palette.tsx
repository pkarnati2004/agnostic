import type { Recommendation, RunTaskRequest } from "@agnostic/core";
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";
import { type ApiError, asApiError } from "../api/error";
import { cn } from "../class-names";
import { Dialog, DialogContent, DialogTitle } from "../components/dialog";
import { HintText } from "../hint-text";
import { filterCommands, moveSelection } from "./filter-commands";
import type { PaletteCommand } from "./palette-command";
import { type PaletteContext, type PaletteHandlers, paletteCommands } from "./palette-commands";
import { recommendRows } from "./recommend-rows";

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: Omit<PaletteContext, "query">;
  handlers: Omit<PaletteHandlers, "recommend">;
  /** The pick for the typed prompt, with nothing started; the palette owns the wait and the error. */
  recommend: (repoId: string, prompt: string) => Promise<Recommendation>;
  runOn: (repoId: string, body: RunTaskRequest) => Promise<void>;
};

/** What the palette is doing. The query and the mode both start again on every open. */
type PaletteState =
  | { mode: "commands" }
  | { mode: "recommending" }
  | { mode: "recommended"; repoId: string; prompt: string; recommendation: Recommendation }
  | { mode: "running" }
  | { mode: "failed"; error: ApiError };

const LIST_ID = "palette-commands";

const optionId = (id: string): string => `palette-row-${id}`;

const WAITING: Record<string, string> = {
  recommending: "Asking agn which profile fits…",
  running: "Starting the task…",
};

/** Every command agn has for this page and the tab in front, by name rather than by button. */
export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<PaletteState>({ mode: "commands" });
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // Each open, and each call, is its own question; an answer to an older one is not this one's.
  const asked = useRef(0);
  // A row that answers inside the palette sets this while it runs; every other row closes it.
  const stays = useRef(false);

  useEffect(() => {
    if (props.open) {
      setQuery("");
      setState({ mode: "commands" });
      setSelected(0);
      asked.current += 1;
    }
  }, [props.open]);

  // A different list of rows under the cursor, so the cursor goes back to the top of it.
  const go = (next: PaletteState) => {
    setState(next);
    setSelected(0);
  };

  const answers = <T,>(call: Promise<T>, then: (answer: T) => void): void => {
    stays.current = true;
    asked.current += 1;
    const mine = asked.current;
    call.then(
      (answer) => {
        if (asked.current === mine) {
          then(answer);
        }
      },
      (cause: unknown) => {
        if (asked.current === mine) {
          go({ mode: "failed", error: asApiError(cause) });
        }
      },
    );
  };

  const rows = rowsFor(props, state, query, {
    recommend: (repoId, prompt) => {
      go({ mode: "recommending" });
      answers(props.recommend(repoId, prompt), (recommendation) =>
        go({ mode: "recommended", repoId, prompt, recommendation }),
      );
    },
    runOn: (repoId, body) => {
      go({ mode: "running" });
      answers(props.runOn(repoId, body), () => props.onOpenChange(false));
    },
    back: () => {
      stays.current = true;
      go({ mode: "commands" });
    },
  });
  const cursor = rows.length === 0 ? 0 : Math.min(selected, rows.length - 1);

  const run = (command: PaletteCommand) => {
    stays.current = false;
    command.run();
    if (!stays.current) {
      props.onOpenChange(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(moveSelection(cursor, rows.length, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = rows[cursor];
      if (command !== undefined) {
        run(command);
      }
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] max-w-xl translate-y-0"
        onOpenAutoFocus={focusInput(input)}
      >
        <DialogTitle className="sr-only">Commands</DialogTitle>
        <input
          ref={input}
          value={query}
          aria-label="Command"
          aria-controls={LIST_ID}
          aria-activedescendant={rows[cursor] === undefined ? undefined : optionId(rows[cursor].id)}
          placeholder="Type a command, or a prompt to run"
          onChange={(change) => {
            setQuery(change.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          className="w-full border-border border-b bg-transparent px-4 py-3 text-sm outline-none"
        />
        <PaletteBody state={state} rows={rows} cursor={cursor} onRun={run} onHover={setSelected} />
        <p className="border-border border-t px-4 py-2 text-muted-foreground text-xs">
          ↑↓ move · ↵ run · esc close
        </p>
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = {
  state: PaletteState;
  rows: PaletteCommand[];
  cursor: number;
  onRun: (command: PaletteCommand) => void;
  onHover: (index: number) => void;
};

function PaletteBody({ state, rows, cursor, onRun, onHover }: BodyProps) {
  const waiting = WAITING[state.mode];
  if (waiting !== undefined) {
    return <Line>{waiting}</Line>;
  }
  return (
    <>
      {state.mode === "failed" && <Refusal error={state.error} />}
      {rows.length === 0 ? (
        <Line>No command matches</Line>
      ) : (
        <div
          role="listbox"
          id={LIST_ID}
          aria-label="Commands"
          className="max-h-80 overflow-y-auto py-2"
        >
          {rows.map((command, index) => (
            <Row
              key={command.id}
              command={command}
              selected={index === cursor}
              onRun={() => onRun(command)}
              onHover={() => onHover(index)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** What the daemon said, in its own words, as the notice and the dialogs say it. */
function Refusal({ error }: { error: ApiError }) {
  return (
    <div className="px-4 pt-3">
      <p className="text-destructive text-sm">{error.message}</p>
      {error.hint !== null && (
        <p className="mt-1 text-muted-foreground text-xs">
          <HintText hint={error.hint} />
        </p>
      )}
    </div>
  );
}

type RowProps = {
  command: PaletteCommand;
  selected: boolean;
  onRun: () => void;
  onHover: () => void;
};

/**
 * The input keeps the focus and the keys, as a listbox does, so a row is never tabbed to. The press
 * rather than the release runs it: the mouse is a shortcut to what Enter would have done.
 */
function Row({ command, selected, onRun, onHover }: RowProps) {
  const row = useRef<HTMLDivElement>(null);
  // The list scrolls past the fold, and the keys move the cursor, so the cursor brings the list.
  useEffect(() => {
    if (selected) {
      row.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);
  return (
    <div
      ref={row}
      role="option"
      id={optionId(command.id)}
      tabIndex={-1}
      aria-selected={selected}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex min-w-0 cursor-pointer items-baseline gap-3 px-4 py-2 text-sm",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {command.hint !== null && (
        <span className="max-w-[40%] truncate text-muted-foreground text-xs">{command.hint}</span>
      )}
    </div>
  );
}

function Line({ children }: { children: string }) {
  return <p className="px-4 py-6 text-muted-foreground text-sm">{children}</p>;
}

type PaletteCalls = {
  recommend: (repoId: string, prompt: string) => void;
  runOn: (repoId: string, body: RunTaskRequest) => void;
  back: () => void;
};

/** The commands, filtered, or the answer to the last Recommend, which the query never filters. */
function rowsFor(
  props: CommandPaletteProps,
  state: PaletteState,
  query: string,
  calls: PaletteCalls,
): PaletteCommand[] {
  if (state.mode === "recommended") {
    return recommendRows(state.prompt, state.recommendation, {
      runOn: (body) => calls.runOn(state.repoId, body),
      back: calls.back,
    });
  }
  const handlers: PaletteHandlers = { ...props.handlers, recommend: calls.recommend };
  return filterCommands(paletteCommands({ ...props.context, query }, handlers), query);
}

/** The input is what the palette is for, so it takes the focus rather than the close button. */
function focusInput(input: RefObject<HTMLInputElement | null>) {
  return (event: Event) => {
    event.preventDefault();
    input.current?.focus({ preventScroll: true });
  };
}
