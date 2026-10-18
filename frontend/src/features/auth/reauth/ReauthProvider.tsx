import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { setReauthHandler } from "../../../api/client";
import { ReauthDialog } from "../../../components/ReauthDialog";

interface ReauthCtx {
  /** Resolve order for a 403 reauth_required response, or call directly. */
  requestReauth: () => Promise<boolean>;
}

const Ctx = createContext<ReauthCtx | null>(null);

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const requestReauth = useCallback(() => {
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    setReauthHandler(requestReauth);
    return () => setReauthHandler(null);
  }, [requestReauth]);

  async function confirm(password: string) {
    await new Promise((r) => setTimeout(r, 300));
    const ok = password.length >= 4;
    if (ok) {
      setOpen(false);
      resolver.current?.(true);
      resolver.current = null;
    }
    return ok;
  }

  function cancel() {
    setOpen(false);
    resolver.current?.(false);
    resolver.current = null;
  }

  return (
    <Ctx.Provider value={{ requestReauth }}>
      {children}
      <ReauthDialog open={open} onConfirm={confirm} onCancel={cancel} />
    </Ctx.Provider>
  );
}

export function useReauth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReauth must be used within ReauthProvider");
  return ctx;
}
