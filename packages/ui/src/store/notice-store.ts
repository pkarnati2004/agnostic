import { useCallback, useEffect, useReducer, useRef } from "react";

/** When the failure was recorded, which is what tells a stale timer that it is stale. */
export type Timed = { at: number };

/** One notice per key: the latest failure, because an older one is no longer what agn said. */
export type Notices<T> = Record<string, T & Timed>;

export type NoticesAction<T> =
  | { type: "failed"; key: string; notice: T & Timed }
  /** The next action on that key succeeded, so what failed before is answered. */
  | { type: "cleared"; key: string }
  | { type: "expired"; key: string; at: number };

/** Long enough to read the hint, short enough that a stale line is never read as the state now. */
const NOTICE_TTL_MS = 8000;

export function noticesReducer<T>(state: Notices<T>, action: NoticesAction<T>): Notices<T> {
  switch (action.type) {
    case "failed":
      return { ...state, [action.key]: action.notice };
    case "cleared":
      return without(state, action.key);
    case "expired":
      // A second failure restarted the clock, so an older timer is about a notice that is gone.
      return state[action.key]?.at === action.at ? without(state, action.key) : state;
  }
}

export type NoticesHandle<T> = {
  notices: Notices<T>;
  failed(key: string, notice: T): void;
  cleared(key: string): void;
};

/** A failure shows where the click was and takes itself away again, so nothing has to be dismissed. */
export function useNotices<T>(ttlMs: number = NOTICE_TTL_MS): NoticesHandle<T> {
  const [notices, dispatch] = useReducer(noticesReducer<T>, {});
  // One timer per key: a key holds one notice, so its older timer is about a notice that is gone.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const cancel = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(key);
    }
  }, []);

  const failed = useCallback(
    (key: string, notice: T) => {
      cancel(key);
      const at = Date.now();
      dispatch({ type: "failed", key, notice: { ...notice, at } });
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          dispatch({ type: "expired", key, at });
        }, ttlMs),
      );
    },
    [cancel, ttlMs],
  );

  const cleared = useCallback(
    (key: string) => {
      cancel(key);
      dispatch({ type: "cleared", key });
    },
    [cancel],
  );

  return { notices, failed, cleared };
}

function without<T>(state: Notices<T>, key: string): Notices<T> {
  if (state[key] === undefined) {
    return state;
  }
  return Object.fromEntries(Object.entries(state).filter(([one]) => one !== key));
}
