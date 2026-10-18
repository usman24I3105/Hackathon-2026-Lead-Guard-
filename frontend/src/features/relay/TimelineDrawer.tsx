import { useEffect, useRef } from "react";
import { useStoreState } from "../../state/useStore";
import { store } from "../../state/useStore";
import { clock } from "../../lib/format";
import type { Lead } from "../../mock/types";

export function TimelineDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useStoreState();
  const events = lead ? store.getTimeline(lead.id) : [];

  useEffect(() => {
    if (!lead) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lead, onClose]);

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" role="dialog" aria-modal="true" aria-label={`Timeline for ${lead.name}`}>
      <button className="flex-1" aria-label="Close timeline" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="w-full sm:w-[420px] bg-surface h-full overflow-y-auto p-5 border-l border-line">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{lead.name}</h2>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-paper">✕</button>
        </div>
        <p className="text-sm text-ink-2 mb-5">{lead.phone} · {lead.source}</p>

        <div className="border-l-2 border-line pl-4 flex flex-col gap-4">
          <div className="relative">
            <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-ink" aria-hidden />
            <div className="text-sm">Lead captured</div>
            <div className="text-xs text-ink-2">{clock(lead.createdAt)} · {lead.message}</div>
          </div>
          {events.map((e) => (
            <div key={e.id} className="relative">
              <span
                className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full"
                style={{ background: e.actor === "user" ? "var(--safe)" : "var(--signal)" }}
                aria-hidden
              />
              <div className="text-sm">{e.label}</div>
              <div className="text-xs text-ink-2">{clock(e.at)}{e.actorName ? ` · ${e.actorName}` : ""}</div>
            </div>
          ))}
          {lead.status === "acknowledged" && (
            <div className="relative">
              <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-safe" aria-hidden />
              <div className="text-sm font-medium" style={{ color: "var(--safe)" }}>
                First response in {lead.ttfrSeconds}s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
