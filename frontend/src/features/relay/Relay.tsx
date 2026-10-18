import { useState } from "react";
import { useStoreState, useRealtimeEvent, store } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Button } from "../../components/Primitives";
import { Icon } from "../../components/icons";
import { TeamStrip } from "./TeamStrip";
import { LeadTrack } from "./LeadTrack";
import { LeadCard } from "./LeadCard";
import { TimelineDrawer } from "./TimelineDrawer";
import { ManualLeadModal } from "./ManualLeadModal";
import type { Lead } from "../../mock/types";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import "./relay.css";

type QueueView = "attention" | "acknowledged";

export default function Relay() {
  const { leads, team } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [queueView, setQueueView] = useState<QueueView>("attention");
  const [query, setQuery] = useState("");
  const canManage = !session || has({ role: session.role }, "leads.manage");
  const previewMode = import.meta.env.DEV || import.meta.env.VITE_API_MODE === "mock";

  useRealtimeEvent((event) => {
    if (event.type === "lead.created") {
      setHighlightId(event.leadId);
      setAnnounce("New lead captured.");
      window.setTimeout(() => setHighlightId((id) => id === event.leadId ? null : id), 700);
    }
    if (event.type === "lead.escalated") {
      setHighlightId(event.leadId);
      setAnnounce("A lead was escalated — no acknowledgement.");
      window.setTimeout(() => setHighlightId((id) => id === event.leadId ? null : id), 700);
    }
    if (event.type === "lead.acknowledged") {
      setAnnounce("Lead acknowledged.");
      push("Lead acknowledged. The response timer has stopped.", "success");
    }
    if (event.type === "lead.recovered") {
      push("Lead moved to the recovery queue.", "info");
    }
  });

  const attention = leads
    .filter((lead) => lead.status === "waiting" || lead.status === "escalated")
    .sort((a, b) => b.level - a.level || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const acknowledged = leads
    .filter((lead) => lead.status === "acknowledged")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const showcase = attention[0];
  const source = queueView === "attention" ? attention : acknowledged;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleLeads = normalizedQuery
    ? source.filter((lead) => [lead.name, lead.phone, lead.source, lead.message].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : source;
  const availableCount = team.filter((member) => member.availability === "available").length;
  const escalatedCount = attention.filter((lead) => lead.status === "escalated").length;

  return (
    <div className="relay-page">
      <header className="relay-header">
        <div className="relay-heading">
          <p className="relay-eyebrow">Lead operations</p>
          <div className="relay-heading-row">
            <div>
              <h1>Relay</h1>
              <p className="relay-subtitle">Every enquiry has an owner, a response window, and a clear next step.</p>
            </div>
            <div className={`relay-live-state ${attention.length ? "is-active" : "is-quiet"}`}>
              <span className="relay-live-dot" aria-hidden="true" />
              {attention.length ? `${attention.length} need attention` : "All leads accounted for"}
            </div>
          </div>
        </div>
        <div className="relay-header-actions">
          {previewMode && canManage && (
            <Button variant="secondary" onClick={() => store.runBatonDemo()}>
              <Icon name="activity" size={16} /> Run sample relay
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setManualOpen(true)}>
              <Icon name="plus" size={16} /> Add lead
            </Button>
          )}
        </div>
      </header>

      <div aria-live="polite" className="sr-only">{announce}</div>

      <div className="relay-summary" aria-label="Relay overview">
        <div><strong>{attention.length}</strong><span>Open leads</span></div>
        <div><strong className={escalatedCount ? "has-warning" : ""}>{escalatedCount}</strong><span>Escalated</span></div>
        <div><strong>{availableCount}<small> / {team.length}</small></strong><span>Available now</span></div>
      </div>

      <TeamStrip />

      {showcase && <LeadTrack lead={showcase} />}

      <section className="relay-queue" aria-labelledby="relay-queue-title">
        <div className="relay-queue-heading">
          <div>
            <h2 id="relay-queue-title">Lead queue</h2>
            <p>Review the next response and keep ownership clear.</p>
          </div>
          <label className="relay-search">
            <Icon name="search" size={17} />
            <span className="sr-only">Search lead queue</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a lead" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" size={15} /></button>}
          </label>
        </div>

        <div className="relay-queue-controls">
          <div className="relay-filter-group" role="group" aria-label="Filter lead queue">
            <button type="button" aria-pressed={queueView === "attention"} onClick={() => setQueueView("attention")}>
              Needs attention <span>{attention.length}</span>
            </button>
            <button type="button" aria-pressed={queueView === "acknowledged"} onClick={() => setQueueView("acknowledged")}>
              Acknowledged <span>{acknowledged.length}</span>
            </button>
          </div>
          <p className="relay-results-count" aria-live="polite">
            {visibleLeads.length} {visibleLeads.length === 1 ? "lead" : "leads"}
            {normalizedQuery ? ` matching “${query.trim()}”` : queueView === "attention" ? " in this queue" : " acknowledged"}
          </p>
        </div>

        {visibleLeads.length ? (
          <ul className="relay-lead-list">
            {visibleLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} highlight={highlightId === lead.id} onOpenTimeline={() => setDrawerLead(lead)} />
            ))}
          </ul>
        ) : (
          <div className="relay-empty-state">
            <div className="relay-empty-icon"><Icon name={normalizedQuery ? "search" : queueView === "attention" ? "check" : "activity"} size={20} /></div>
            <div>
              <h3>{normalizedQuery ? "No leads match that search" : queueView === "attention" ? "No leads need attention" : "No acknowledged leads yet"}</h3>
              <p>{normalizedQuery ? "Try a different name, phone number, source, or message." : queueView === "attention" ? "New enquiries will appear here with an owner and response timer." : "Acknowledged leads will appear here once the team responds."}</p>
            </div>
            {normalizedQuery ? (
              <Button variant="tertiary" onClick={() => setQuery("")}>Clear search</Button>
            ) : queueView === "attention" && canManage ? (
              <Button variant="secondary" onClick={() => setManualOpen(true)}><Icon name="plus" size={15} /> Add a lead</Button>
            ) : null}
          </div>
        )}
      </section>

      <TimelineDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
      <ManualLeadModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
