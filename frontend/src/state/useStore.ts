import { useSyncExternalStore } from "react";
import { store } from "../mock/store";
import type { RealtimeEvent } from "../mock/store";
import { useEffect } from "react";

export function useStoreState() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useRealtimeEvent(handler: (e: RealtimeEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    return store.onEvent(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export { store };
