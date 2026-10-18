import { useCallback, useId, useRef, useState } from "react";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";
import { Avatar } from "../../components/Avatar";
import { CountdownRing } from "../../components/CountdownRing";
import { Button } from "../../components/Primitives";
import { Icon } from "../../components/icons";
import { relativeTime } from "../../lib/format";
import { has } from "../../lib/perm";
import { useDismiss } from "../../components/shell/useDismiss";
import type { Lead } from "../../mock/types";
import { PriorityBadge, RelayStatusBadge, SourceChip } from "./RelayUi";

export function LeadCard({ lead, highlight, onOpenTimeline, onAcknowledged }: { lead: Lead; highlight: boolean; onOpenTimeline: () => void; onAcknowledged?: () => void }) {
  const { team } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ackFeedback, setAckFeedback] = useState<"idle" | "success">("idle");
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuOpen, menuRef, closeMenu, triggerRef);

  const owner = team.find((member) => member.id === lead.ownerId);
  const ringMode = lead.status === "acknowledged" ? "acknowledged" : lead.status === "recovery" ? "held" : lead.status === "escalated" ? "overdue" : "running";
  const canAck = !!session && (lead.status === "waiting" || lead.status === "escalated") && lead.ownerId === session.userId;
  const canManage = !session || has({ role: session.role }, "leads.manage");
  const canReassign = canManage && (lead.status === "waiting" || lead.status === "escalated");
  const phoneUri = lead.phone.replace(/[^\d+]/g, "");

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(lead.phone);
      push("Phone number copied.", "success");
    } catch {
      push("Copy is unavailable in this browser.", "info");
    }
  }

  function acknowledgeLead() {
    if (!canAck || !session || ackFeedback !== "idle") return;
    setAckFeedback("success");
    store.acknowledgeLead(lead.id, session.userId);
    onAcknowledged?.();
    window.setTimeout(() => setAckFeedback("idle"), 600);
  }

  return (
    <li role="row" className={"relay-lead-card " + (highlight ? "flash-row" : "")}>
      <button className="relay-lead-hitarea" type="button" onClick={onOpenTimeline} aria-label={"Open timeline for " + lead.name} />
      <div className="relay-lead-main" role="cell">
        <div className="relay-lead-title-row">
          <h3>{lead.name}</h3>
          <PriorityBadge level={lead.level} escalated={lead.status === "escalated"} />
        </div>
        <div className="relay-lead-contact">
          <a href={"tel:" + phoneUri} aria-label={"Call " + lead.name + " at " + lead.phone}>
            <Icon name="phone" size={13} />{lead.phone}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="md"
            iconOnly
            aria-label={"Copy " + lead.name + " phone number"}
            title="Copy phone number"
            onClick={copyPhone}
          ><Icon name="copy" size={15} /></Button>
        </div>
      </div>

      <div className="relay-lead-source" role="cell"><SourceChip source={lead.source} /></div>
      <p className="relay-lead-message" role="cell" title={lead.message}>{lead.message}</p>

      <div className="relay-lead-owner" role="cell">
        {owner ? <Avatar name={owner.name} color={owner.avatarColor} size={28} availability={owner.availability} title={owner.name} /> : <span className="relay-unassigned" aria-hidden="true">?</span>}
        <div><strong title={owner?.name}>{owner?.name ?? "Unassigned"}</strong></div>
      </div>

      <div className="relay-lead-timing" role="cell">
        <CountdownRing ackDeadline={lead.ackDeadline} mode={ringMode} size={40} />
        <div>
          <RelayStatusBadge status={lead.status === "waiting" || lead.status === "escalated" || lead.status === "recovery" ? lead.status : "acknowledged"} />
          <time dateTime={lead.createdAt} title={new Date(lead.createdAt).toLocaleString()}>{relativeTime(lead.createdAt)}</time>
        </div>
      </div>

      <div className="relay-lead-actions" role="cell">
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="relay-timeline-action"
          leadingIcon={<Icon name="history" size={16} />}
          aria-label={"Open timeline for " + lead.name}
          title="View lead timeline"
          onClick={onOpenTimeline}
        >Timeline</Button>
        {(canAck || ackFeedback === "success") ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="relay-ack-button"
            success={ackFeedback === "success"}
            disabled={ackFeedback === "success"}
            onClick={acknowledgeLead}
          >{ackFeedback === "success" ? "Acknowledged" : "Acknowledge"}</Button>
        ) : lead.status === "acknowledged" ? (
          <span className="relay-acknowledged-label"><Icon name="check" size={14} />Acknowledged by {owner?.name ?? "team"}</span>
        ) : null}
        {canReassign && (
          <div className="relay-overflow" ref={menuRef}>
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="md"
              iconOnly
              className="relay-overflow-trigger"
              aria-label={"More actions for " + lead.name}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              title="More actions"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name="more" size={18} />
            </Button>
            {menuOpen && (
              <div id={menuId} className="relay-overflow-menu" role="menu" aria-label={"Reassign " + lead.name}>
                <span className="relay-overflow-heading">Reassign to</span>
                {team.map((member) => (
                  <Button
                    key={member.id}
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="relay-menu-item"
                    role="menuitem"
                    disabled={member.id === lead.ownerId}
                    onClick={() => {
                      store.reassignLead(lead.id, member.id);
                      setMenuOpen(false);
                      push("Lead reassigned to " + member.name + ".", "success");
                      triggerRef.current?.focus();
                    }}
                  >
                    <Avatar name={member.name} color={member.avatarColor} size={24} />
                    <span>{member.name}</span>
                    {member.id === lead.ownerId && <span className="relay-current-owner">Current</span>}
                  </Button>
                ))}
                <p><Icon name="info" size={14} />Escalation is handled automatically.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
