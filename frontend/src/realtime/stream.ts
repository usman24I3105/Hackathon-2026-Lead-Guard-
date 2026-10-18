import { apiFetch } from "../api/client";
import { ApiError } from "../api/errors";
import { onSessionClear } from "../lib/session";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

let source: EventSource | null = null;

/**
 * Opens the real-time event stream. Only meaningful in real-API mode — mock
 * mode drives its own in-process event bus (see mock/store.ts) and never
 * calls this.
 */
export function connectStream(onMessage: (type: string, id: string) => void) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  closeStream();
  source = new EventSource(`${BASE}/stream`, { withCredentials: true });
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data.type, data.id);
    } catch {
      // Malformed frame — drop it, the next one will resync via refetch.
    }
  };
  source.onerror = () => {
    // The browser already retries transient drops on its own. We only need
    // to break that loop when the underlying cause is an expired session —
    // probe once and let apiFetch's central 401 handling clear the session.
    void apiFetch("/me").catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        closeStream();
      }
    });
  };
}

export function closeStream() {
  source?.close();
  source = null;
}

onSessionClear(closeStream);
