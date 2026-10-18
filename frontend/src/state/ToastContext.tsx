import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "../components/icons";

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

  const dismiss = useCallback((id: string) => setToasts((items) => items.filter((toast) => toast.id !== id)), []);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((items) => [...items, { id, message, tone }]);
    if (tone !== "error") window.setTimeout(() => dismiss(id), 3200);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-20 md:bottom-5 right-4 md:right-6 z-50 flex flex-col gap-2 w-[min(90vw,360px)]" aria-live="polite" aria-relevant="additions text" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast is-${toast.tone}`}>
            <span className="app-toast-icon" aria-hidden="true">
              <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "recovery" : "activity"} size={15} />
            </span>
            <span className="app-toast-message">{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification" className="app-toast-dismiss">
              <Icon name="close" size={14} />
            </button>
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
