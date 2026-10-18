import { ApiError } from "./errors";
import { clearSession } from "../lib/session";
import { setServerOffset } from "../lib/time";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

// Registered by ReauthProvider so this plain module can trigger the dialog
// without importing React context machinery directly.
let reauthHandler: (() => Promise<boolean>) | null = null;
export function setReauthHandler(fn: (() => Promise<boolean>) | null) {
  reauthHandler = fn;
}

interface RequestOptions extends RequestInit {
  /** Internal: prevents infinite retry loops after a single reauth attempt. */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network_error", "Couldn't reach the server.");
  }

  const serverTime = res.headers.get("X-Server-Time");
  if (serverTime) setServerOffset(serverTime);

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const body = await res.json().catch(() => ({}));
  const code: string = body?.error?.code ?? "unknown";
  const message: string = body?.error?.message ?? res.statusText;
  const requestId: string | undefined = body?.error?.requestId;

  if (res.status === 401) {
    clearSession({ returnTo: typeof window !== "undefined" ? window.location.pathname : undefined });
    throw new ApiError(401, "unauthenticated", message, { requestId });
  }

  if (res.status === 403 && code === "reauth_required" && !options._retried && reauthHandler) {
    const confirmed = await reauthHandler();
    if (confirmed) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
  }

  if (res.status === 429) {
    const retryAfterSeconds = Number(res.headers.get("Retry-After")) || undefined;
    throw new ApiError(429, "rate_limited", message, { requestId, retryAfterSeconds });
  }

  if (res.status === 413) {
    throw new ApiError(413, "payload_too_large", message, { requestId });
  }

  throw new ApiError(res.status, code, message, { requestId });
}
