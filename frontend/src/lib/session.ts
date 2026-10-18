import type { Role } from "./perm";
import { queryClient } from "../api/queryClient";
import { isSafeReturnTo } from "./safeUrl";

export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  workspace: string;
}

// Session lives in memory only — never localStorage/sessionStorage. A real
// backend would set an httpOnly cookie the server trusts; this app's job is
// just to reflect that state and react to its expiry, not to persist it.
let session: Session | null = null;
const listeners = new Set<() => void>();
const clearHooks = new Set<() => void>();

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session | null) {
  session = next;
  listeners.forEach((fn) => fn());
}

export function subscribeSession(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Register cleanup to run whenever the session is cleared (e.g. closing the SSE stream). */
export function onSessionClear(fn: () => void) {
  clearHooks.add(fn);
  return () => {
    clearHooks.delete(fn);
  };
}

/** Call on logout and on any 401. Clears all client state and redirects to /login. */
export function clearSession(opts?: { returnTo?: string }) {
  setSession(null);
  clearHooks.forEach((fn) => fn());
  queryClient.clear();

  if (typeof window === "undefined") return;
  const returnTo = isSafeReturnTo(opts?.returnTo) ? opts!.returnTo : undefined;
  const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
  if (window.location.pathname + window.location.search !== target) {
    window.location.assign(target);
  }
}
