import type { Event, EventKind } from "./event.js";

/** `Event` is a union over its kinds; this is what narrows one to the payload of the kind read. */
export function isKind<K extends EventKind>(event: Event, kind: K): event is Event<K> {
  return event.kind === kind;
}
