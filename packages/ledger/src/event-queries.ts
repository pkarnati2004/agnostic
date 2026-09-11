import {
  type Event,
  type EventInput,
  EventInputSchema,
  type EventKind,
  EventSchema,
} from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { LedgerError, rowInvalid } from "./error.js";

const DEFAULT_LIMIT = 500;

type EventRow = {
  id: number;
  ts: string;
  task_id: string | null;
  repo_id: string | null;
  kind: string;
  payload_json: string;
};

export type EventQueries = {
  append<K extends EventKind>(input: EventInput<K>): Event<K>;
  /** The SSE cursor: everything newer than `cursor`, oldest first. */
  after(cursor: number, limit?: number): Event[];
  forTask(taskId: string): Event[];
  latestId(): number;
};

export function createEventQueries(db: Database): EventQueries {
  const insert = db.prepare(
    "INSERT INTO events (ts, task_id, repo_id, kind, payload_json) VALUES (?, ?, ?, ?, ?)",
  );
  const selectAfter = db.prepare("SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?");
  const selectForTask = db.prepare("SELECT * FROM events WHERE task_id = ? ORDER BY id");
  const selectLatest = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events");

  return {
    // One INSERT is already atomic; the transactions elsewhere exist to bind a row to its event.
    append<K extends EventKind>(input: EventInput<K>): Event<K> {
      const parsed = EventInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new LedgerError(`a ${input.kind} event does not carry that kind's payload`, {
          code: "event-invalid",
          hint: "Payload shapes live in core's event.ts.",
          cause: parsed.error,
        });
      }
      const info = insert.run(
        input.ts,
        input.taskId ?? null,
        input.repoId ?? null,
        input.kind,
        JSON.stringify(input.payload),
      );
      return { ...input, id: Number(info.lastInsertRowid) };
    },

    after(cursor: number, limit: number = DEFAULT_LIMIT): Event[] {
      return (selectAfter.all(cursor, limit) as EventRow[]).map(toEvent);
    },

    forTask(taskId: string): Event[] {
      return (selectForTask.all(taskId) as EventRow[]).map(toEvent);
    },

    latestId(): number {
      return (selectLatest.get() as { id: number }).id;
    },
  };
}

function toEvent(row: EventRow): Event {
  const payload: unknown = JSON.parse(row.payload_json);
  const parsed = EventSchema.safeParse({
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    payload,
    ...(row.task_id === null ? {} : { taskId: row.task_id }),
    ...(row.repo_id === null ? {} : { repoId: row.repo_id }),
  });
  if (!parsed.success) {
    throw rowInvalid("events", parsed.error);
  }
  return parsed.data;
}
