import { EventsQuerySchema } from "@agnostic/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";

const DEFAULT_HEARTBEAT_MS = 15_000;
const RETRY_MS = 1_000;

/**
 * `Last-Event-ID` wins over `?after`: `EventSource` keeps the original URL when it reconnects, so
 * the header is the only cursor that is up to date after a drop.
 */
export function eventRoutes(ctx: DaemonContext): Hono {
  return new Hono().get("/events", (c) => {
    const query = EventsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      throw requestInvalid(query.error);
    }
    const cursor = resumeFrom(c.req.header("last-event-id")) ?? query.data.after ?? 0;
    return streamSSE(c, async (stream) => {
      // The cursor is a ledger row number, which says nothing about who is listening.
      ctx.log.info("sse connect", { cursor });
      // Frames are written in order on one chain; a rejected write means the client is already
      // gone and the abort handler below is what cleans up.
      let queue: Promise<unknown> = stream.write(`retry: ${RETRY_MS}\n\n`);
      const write = (frame: () => Promise<unknown>) => {
        queue = queue.then(frame, () => undefined);
      };
      const unsubscribe = ctx.feed.subscribe(cursor, (event) => {
        write(() =>
          stream.writeSSE({
            id: String(event.id),
            event: event.kind,
            data: JSON.stringify(event),
          }),
        );
      });
      const heartbeat = setInterval(
        () => write(() => stream.write(": ping\n\n")),
        ctx.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
      );
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
      clearInterval(heartbeat);
      unsubscribe();
      ctx.log.info("sse disconnect", { cursor });
    });
  });
}

function resumeFrom(header: string | undefined): number | null {
  const id = Number(header);
  return header !== undefined && Number.isInteger(id) && id >= 0 ? id : null;
}
