import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { store } from "./useStore";
import { clearSession, getSession, setSession, subscribeSession, type Session } from "../lib/session";
import { apiFetch } from "../api/client";

interface AuthCtx {
  session: Session | null;
  login: (email: string, password: string) => Promise<{ ok: true; session: Session } | { ok: false; error: string }>;
  signup: (name: string, email: string, password: string, workspace: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSession, getSession);

  useEffect(() => {
    if (!getSession()) {
      apiFetch<{
        user: { id: string; email: string; name: string; role: string; workspaceId: string };
        workspace?: { id: string; name: string };
      }>("/me")
        .then((res) => {
          if (res?.user) {
            const role = res.user.role === "owner" ? "Owner" : res.user.role === "admin" ? "Admin" : "User";
            setSession({
              userId: res.user.id,
              name: res.user.name,
              email: res.user.email,
              role: role as any,
              workspace: res.user.workspaceId,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      login: async (email, password) => {
        const result = await store.login(email, password);
        if (!result.ok) return result;
        setSession(result.session);
        return { ok: true, session: result.session };
      },
      signup: async (name, email, password, workspace) => {
        const result = await store.signup(name, email, password, workspace);
        if (!result.ok) return result;
        setSession(result.session);
        return { ok: true };
      },
      logout: () => clearSession(),
    }),
    [session]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
