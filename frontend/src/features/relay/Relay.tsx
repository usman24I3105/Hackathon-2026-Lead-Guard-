import { useState } from "react";
import { useStoreState, useRealtimeEvent, store } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Button, EmptyState } from "../../components/Primitives";
import { TeamStrip } from "./TeamStrip";
import { LeadTrack } from "./LeadTrack";
import { LeadCard } from "./LeadCard";
import { TimelineDrawer } from "./TimelineDrawer";
import { ManualLeadModal } from "./ManualLeadModal";
import type { Lead } from "../../mock/types";

export default function Relay() {
  const { leads } = useStoreState();
  const { push } = useToast();
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  useRealtimeEvent((e) => {
    if (e.type === "lead.created") {
      setHighlightId(e.leadId);
      setAnnounce("New lead captured.");
      window.setTimeout(() => setHighlightId((h) => (h === e.leadId ? null : h)), 700);
    }
    if (e.type === "lead.escalated") {
      setHighlightId(e.leadId);
      setAnnounce("A lead was escalated — no acknowledgement.");
      window.setTimeout(() => setHighlightId((h) => (h === e.leadId ? null : h)), 700);
    }
    if (e.type === "lead.acknowledged") {
      setAnnounce("Lead acknowledged.");
      push("Acknowledged. Ring stopped.", "success");
    }
    if (e.type === "lead.recovered") {
      push("Lead moved to the recovery queue.", "error");
    }
  });

  const active = leads.filter((l) => l.status === "waiting" || l.status === "escalated");
  const resolved = leads.filter((l) => l.status === "acknowledged");
  const showcase = active.sort((a, b) => a.level < b.level ? 1 : -1)[0] ?? resolved[0];

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-5 pb-3">
        <div>
          <h1 className="text-2xl font-semibold">Relay</h1>
          <p className="text-sm text-ink-2">Every lead has an owner and a clock.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => store.runBatonDemo()}>▶ Run demo lead</Button>
          <Button onClick={() => setManualOpen(true)}>Add lead</Button>
        </div>
      </header>

      <div aria-live="polite" className="sr-only">{announce}</div>

      <TeamStrip />
      {showcase && <LeadTrack lead={showcase} />}

      <section className="px-4 sm:px-6 py-5">
        <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Waiting &amp; escalated</h2>
        {active.length === 0 ? (
          <EmptyState title="No leads waiting. Every lead has an owner." body="New leads from your public form or manual entry will appear here instantly." />
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((lead) => (
              <LeadCard key={lead.id} lead={lead} highlight={highlightId === lead.id} onOpenTimeline={() => setDrawerLead(lead)} />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="px-4 sm:px-6 py-5 border-t border-line">
          <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Acknowledged today</h2>
          <ul className="flex flex-col gap-3">
            {resolved.map((lead) => (
              <LeadCard key={lead.id} lead={lead} highlight={highlightId === lead.id} onOpenTimeline={() => setDrawerLead(lead)} />
            ))}
          </ul>
        </section>
      )}

      <TimelineDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
      <ManualLeadModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
