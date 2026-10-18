import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { store } from "../mock/store";
import type { Role } from "../lib/perm";

interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  workspace: string;
}

interface AuthCtx {
  session: Session | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signup: (name: string, email: string, password: string, workspace: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem("leadguard.session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      login: async (email, password) => {
        await new Promise((r) => setTimeout(r, 450));
        if (!password || password.length < 4) {
          return { ok: false, error: "Incorrect email or password." };
        }
        const member = store.getState().team.find((m) => m.id === "u-imran")!;
        const s: Session = { userId: member.id, name: member.name, email, role: member.role, workspace: "LeadGuard Roofing" };
        localStorage.setItem("leadguard.session", JSON.stringify(s));
        setSession(s);
        return { ok: true };
      },
      signup: async (name, email, _password, workspace) => {
        await new Promise((r) => setTimeout(r, 450));
        if (email.toLowerCase() === "taken@leadguard.app") {
          return { ok: false, error: "That email is already in use on another workspace." };
        }
        const s: Session = { userId: "u-owais", name, email, role: "Owner", workspace: workspace || "My Roofing Co." };
        localStorage.setItem("leadguard.session", JSON.stringify(s));
        setSession(s);
        return { ok: true };
      },
      logout: () => {
        localStorage.removeItem("leadguard.session");
        setSession(null);
      },
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
