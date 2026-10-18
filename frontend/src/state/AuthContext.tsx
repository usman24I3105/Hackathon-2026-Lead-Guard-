import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { store } from "./useStore";
import { clearSession, getSession, setSession, subscribeSession, type Session } from "../lib/session";

interface AuthCtx {
  session: Session | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signup: (name: string, email: string, password: string, workspace: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSession, getSession);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      login: async (email, password) => {
        const result = await store.login(email, password);
        if (!result.ok) return result;
        setSession(result.session);
        return { ok: true };
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
