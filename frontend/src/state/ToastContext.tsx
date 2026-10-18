import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast {
  id: string;
  message: string;
  tone: "success" | "error" | "info";
}

interface ToastCtx {
  push: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    const duration = tone === "error" ? 6000 : 3000;
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(90vw,360px)]" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "rounded-[10px] border px-4 py-3 text-sm shadow-sm bg-surface flex items-start gap-2 " +
              (t.tone === "error" ? "border-alarm text-alarm" : t.tone === "info" ? "border-focus text-focus" : "border-safe text-safe")
            }
          >
            <span aria-hidden>{t.tone === "error" ? "⚠" : t.tone === "info" ? "ℹ" : "✓"}</span>
            <span className="text-ink">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
