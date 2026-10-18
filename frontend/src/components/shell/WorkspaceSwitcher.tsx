import { useCallback, useId, useRef, useState } from "react";
import type { Workspace } from "../../api/types/shell";
import { Icon } from "../icons";
import { useDismiss } from "./useDismiss";

export function WorkspaceSwitcher({
  workspaces,
  fallbackName,
  onSwitch,
  className = "",
}: {
  workspaces: Workspace[] | undefined;
  /** Shown while the list loads (e.g. the session's workspace name). */
  fallbackName: string;
  onSwitch: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close, triggerRef);

  const current = workspaces?.find((w) => w.current)?.name ?? fallbackName;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 h-10 px-3 rounded-control border border-border-strong bg-surface text-sm font-medium text-text hover:bg-neutral-bg transition-colors"
      >
        <span className="sr-only">Workspace:</span>
        <span className="truncate">{current}</span>
        <Icon name="chevron-down" size={16} className={`ml-auto shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={listId} className="absolute left-0 top-full mt-1 z-40 min-w-full w-64 rounded-card border border-border bg-surface shadow-lg py-1">
          {(workspaces ?? []).map((w) => (
            <li key={w.id}>
              <button
                type="button"
                aria-current={w.current ? "true" : undefined}
                onClick={() => {
                  setOpen(false);
                  if (!w.current) onSwitch(w.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-text hover:bg-neutral-bg"
              >
                <span className="flex-1 truncate">{w.name}</span>
                {w.current && <Icon name="check" size={16} className="text-primary" />}
              </button>
            </li>
          ))}
          {!workspaces?.length && <li className="px-3 py-2 text-sm text-text-muted">Loading workspaces…</li>}
        </ul>
      )}
    </div>
  );
}
