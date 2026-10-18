import { useRef, useState, type KeyboardEvent } from "react";
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
import { RelayErrorState, RelayLoadingState } from "./RelayUi";
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
  const tabRefs = useRef<Record<QueueView, HTMLButtonElement | null>>({ attention: null, acknowledged: null });
  const previewState = import.meta.env.DEV && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("relayState")
    : null;
  const [stateOverride, setStateOverride] = useState<"loading" | "error" | null>(
    previewState === "loading" || previewState === "error" ? previewState : null
  );
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

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const order: QueueView[] = ["attention", "acknowledged"];
    const currentIndex = order.indexOf(queueView);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % order.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + order.length) % order.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? order.length - 1
            : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      const next = order[nextIndex];
      setQueueView(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div className="relay-page">
      <header className="relay-header">
        <div className="relay-heading">
          <p className="relay-eyebrow">Customer management <span aria-hidden="true">/</span> Live relay</p>
          <div className="relay-heading-row">
            <div className="relay-title-copy">
              <div className="relay-title-line">
                <h1>Relay</h1>
                <div className={`relay-live-state ${attention.length ? "is-active" : "is-quiet"}`} role="status">
                  <span className="relay-live-dot" aria-hidden="true" />
                  <span>{attention.length ? `${attention.length} need attention` : "All leads accounted for"}</span>
                </div>
              </div>
              <p className="relay-subtitle">Every enquiry has an owner, a response window, and a clear next step.</p>
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

      {stateOverride === "loading" ? <RelayLoadingState /> : stateOverride === "error" ? (
        <RelayErrorState onRetry={() => setStateOverride(null)} />
      ) : (
        <>
          <section className="relay-summary" aria-label="Relay overview">
            <div className="relay-stat is-info">
              <div className="relay-stat-heading">
                <span className="relay-stat-icon"><Icon name="inbox" size={16} /></span>
                <span className="relay-stat-label">Needs response</span>
              </div>
              <strong>{attention.length}</strong>
              <span className="relay-stat-helper" title="Leads still moving through relay">Leads still moving through relay</span>
            </div>
            <div className={`relay-stat is-danger${escalatedCount > 0 ? " has-value" : ""}`}>
              <div className="relay-stat-heading">
                <span className="relay-stat-icon"><Icon name="clock" size={16} /></span>
                <span className="relay-stat-label">Past due</span>
              </div>
              <strong>{escalatedCount}</strong>
              <span className="relay-stat-helper" title="Escalation happens automatically">Escalation happens automatically</span>
            </div>
            <div className="relay-stat is-success">
              <div className="relay-stat-heading">
                <span className="relay-stat-icon"><Icon name="team" size={16} /></span>
                <span className="relay-stat-label">Ready now</span>
              </div>
              <strong>{availableCount}<small> / {team.length}</small></strong>
              <span className="relay-capacity-pips" role="img" aria-label={`${availableCount} of ${team.length} teammates available`}>
                {[0, 1, 2, 3].map((segment) => <span key={segment} className={segment < availableCount ? "is-filled" : ""} aria-hidden="true" />)}
              </span>
              <span className="relay-stat-helper" title="Teammates available to respond">Teammates available to respond</span>
            </div>
          </section>

          <TeamStrip />
          {showcase && <LeadTrack lead={showcase} />}

          <section className="relay-queue" aria-labelledby="relay-queue-title">
            <div className="relay-queue-heading">
              <div>
                <h2 id="relay-queue-title">Lead queue</h2>
                <p>Review new enquiries and keep the next response moving.</p>
              </div>
              <label className="relay-search">
                <Icon name="search" size={17} />
                <span className="sr-only">Search lead queue</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone or message" />
                {query && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    iconOnly
                    className="relay-search-clear"
                    aria-label="Clear lead search"
                    title="Clear search"
                    onClick={() => setQuery("")}
                  ><Icon name="close" size={15} /></Button>
                )}
              </label>
            </div>

            <div className="relay-queue-controls">
              <div className="relay-filter-group" role="tablist" aria-label="Lead queue views" aria-orientation="horizontal">
                <button
                  ref={(node) => { tabRefs.current.attention = node; }}
                  id="relay-tab-attention"
                  type="button"
                  role="tab"
                  aria-selected={queueView === "attention"}
                  aria-controls="relay-queue-panel"
                  tabIndex={queueView === "attention" ? 0 : -1}
                  onClick={() => setQueueView("attention")}
                  onKeyDown={onTabKeyDown}
                >
                  Needs attention <span>{attention.length}</span>
                </button>
                <button
                  ref={(node) => { tabRefs.current.acknowledged = node; }}
                  id="relay-tab-acknowledged"
                  type="button"
                  role="tab"
                  aria-selected={queueView === "acknowledged"}
                  aria-controls="relay-queue-panel"
                  tabIndex={queueView === "acknowledged" ? 0 : -1}
                  onClick={() => setQueueView("acknowledged")}
                  onKeyDown={onTabKeyDown}
                >
                  Acknowledged <span>{acknowledged.length}</span>
                </button>
              </div>
              <p className="relay-results-count" aria-live="polite">
                Showing {visibleLeads.length} of {source.length}
              </p>
            </div>

            <div id="relay-queue-panel" role="tabpanel" aria-labelledby={queueView === "attention" ? "relay-tab-attention" : "relay-tab-acknowledged"} tabIndex={0}>
              {visibleLeads.length ? (
                <div className="relay-lead-table" role="table" aria-label="Lead queue">
                  <div className="relay-lead-table-head" role="rowgroup">
                    <div className="relay-lead-table-row" role="row">
                      <span role="columnheader">Lead</span>
                      <span role="columnheader">Source</span>
                      <span role="columnheader">Message</span>
                      <span role="columnheader">Owner</span>
                      <span role="columnheader">Response</span>
                      <span role="columnheader" className="is-actions">Actions</span>
                    </div>
                  </div>
                  <ul className="relay-lead-list" role="rowgroup">
                  {visibleLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      highlight={highlightId === lead.id}
                      onOpenTimeline={() => setDrawerLead(lead)}
                      onAcknowledged={() => setQueueView("acknowledged")}
                    />
                  ))}
                  </ul>
                </div>
              ) : (
                <div className="relay-empty-state">
                  <div className="relay-empty-icon"><Icon name={normalizedQuery ? "search" : queueView === "attention" ? "check" : "history"} size={20} /></div>
                  <div className="relay-empty-copy">
                    <h3>{normalizedQuery ? "No leads match that search" : queueView === "attention" ? "You’re all caught up" : "Nothing acknowledged yet"}</h3>
                    <p>{normalizedQuery ? "Try a different name, phone number, source, or message." : queueView === "attention" ? "New enquiries arrive here with an owner and a response timer." : "Leads move here as soon as someone acknowledges them."}</p>
                  </div>
                  {normalizedQuery ? (
                    <Button variant="secondary" size="md" onClick={() => setQuery("")}>Clear search</Button>
                  ) : queueView === "attention" && canManage ? (
                    <Button variant="secondary" onClick={() => setManualOpen(true)}><Icon name="plus" size={15} /> Add a lead</Button>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <TimelineDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
      <ManualLeadModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
