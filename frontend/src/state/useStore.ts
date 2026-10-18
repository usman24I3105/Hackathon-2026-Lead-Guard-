import { useSyncExternalStore, useEffect } from "react";
import { createStore } from "../api/adapter";
import type { RealtimeEvent, StoreLike } from "./storeTypes";

let instance: StoreLike | null = null;
let readyPromise: Promise<StoreLike> | null = null;

/** Call once in main.tsx, before the app renders, and await it. */
export function ensureStore(): Promise<StoreLike> {
  if (!readyPromise) {
    readyPromise = createStore().then((s) => {
      instance = s;
      return s;
    });
  }
  return readyPromise;
}

function requireInstance(): StoreLike {
  if (!instance) {
    throw new Error("Store accessed before initialization — ensureStore() must be awaited in main.tsx first.");
  }
  return instance;
}

/** Proxies every call to whichever store the adapter picked, once ready. */
export const store: StoreLike = new Proxy({} as StoreLike, {
  get(_target, prop) {
    const target = requireInstance() as unknown as Record<string, unknown>;
    const value = target[prop as string];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export function useStoreState() {
  return useSyncExternalStore(
    (onChange) => requireInstance().subscribe(onChange),
    () => requireInstance().getState(),
    () => requireInstance().getState()
  );
}

export function useRealtimeEvent(handler: (e: RealtimeEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    return requireInstance().onEvent(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
