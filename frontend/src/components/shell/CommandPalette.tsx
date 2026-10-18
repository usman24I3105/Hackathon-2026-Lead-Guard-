import { useMemo, useRef, useState } from "react";
import type { NavItem } from "./nav";
import { Icon } from "../icons";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function CommandPalette({
  open,
  items,
  onClose,
  onNavigate,
  onCreateLead,
  canCreateLead,
}: {
  open: boolean;
  items: NavItem[];
  onClose: () => void;
  onNavigate: (path: string) => void;
  onCreateLead: () => void;
  canCreateLead: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useFocusTrap(panelRef, open, onClose);

  const actions = useMemo(() => [
    ...items.map((item) => ({ label: item.label, detail: item.group, icon: item.icon, run: () => onNavigate(item.to) })),
    ...(canCreateLead ? [{ label: "Add a lead", detail: "Create", icon: "plus" as const, run: onCreateLead }] : []),
  ], [canCreateLead, items, onCreateLead, onNavigate]);
  const filtered = actions.filter((action) => `${action.label} ${action.detail}`.toLowerCase().includes(query.toLowerCase()));

  if (!open) return null;

  function choose(index: number) {
    const action = filtered[index];
    if (!action) return;
    onClose();
    action.run();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/45 p-3 pt-[12vh] backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Command menu" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Icon name="search" size={19} className="text-text-muted" />
          <input
            data-autofocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(filtered.length - 1, value + 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
              if (event.key === "Enter") { event.preventDefault(); choose(active); }
            }}
            aria-label="Search pages and actions"
            placeholder="Jump to a page or run an action…"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded border border-border bg-neutral-bg px-1.5 py-0.5 text-[10px] text-text-muted">ESC</kbd>
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Pages and actions</p>
          {filtered.length ? filtered.map((action, index) => (
            <button
              key={`${action.label}-${action.detail}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm ${index === active ? "bg-primary-soft text-primary" : "text-text hover:bg-neutral-bg"}`}
            >
              <Icon name={action.icon} size={17} />
              <span className="flex-1">{action.label}</span>
              <span className="text-xs text-text-muted">{action.detail}</span>
            </button>
          )) : (
            <p className="px-3 py-5 text-sm text-text-muted">No matching pages or actions.</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-text-muted">
          <span>Navigate the workspace</span><span>↑ ↓ move · ↵ open</span>
        </div>
      </div>
    </div>
  );
}
