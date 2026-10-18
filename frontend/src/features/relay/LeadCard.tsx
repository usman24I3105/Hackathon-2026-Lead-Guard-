import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { CountdownRing } from "../../components/CountdownRing";
import { LevelPips } from "../../components/LevelPips";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { Button } from "../../components/Primitives";
import { Icon } from "../../components/icons";
import { relativeTime } from "../../lib/format";
import type { Lead } from "../../mock/types";

export function LeadCard({ lead, highlight, onOpenTimeline }: { lead: Lead; highlight: boolean; onOpenTimeline: () => void }) {
  const { team } = useStoreState();
  const { session } = useAuth();
  const owner = team.find((member) => member.id === lead.ownerId);
  const ringMode = lead.status === "acknowledged" ? "acknowledged" : lead.status === "recovery" ? "held" : lead.status === "escalated" ? "overdue" : "running";
  const chipKind: ChipKind = lead.status === "recovery" ? "recovery" : lead.status === "escalated" ? "escalated" : lead.status;
  const canAck = (lead.status === "waiting" || lead.status === "escalated") && lead.ownerId === session?.userId;

  return (
    <li className={`relay-lead-card ${highlight ? "flash-row" : ""}`}>
      <div className="relay-lead-main">
        <div className="relay-lead-title-row">
          <h3>{lead.name}</h3>
          <LevelPips level={lead.level} />
        </div>
        <p className="relay-lead-contact">{lead.phone} <span aria-hidden="true">·</span> {lead.source}</p>
        <p className="relay-lead-message">{lead.message}</p>
      </div>

      <div className="relay-lead-owner">
        {owner ? <Avatar name={owner.name} color={owner.avatarColor} size={34} availability={owner.availability} title={owner.name} /> : <span className="relay-unassigned" aria-hidden="true">?</span>}
        <div><span>Owner</span><strong>{owner?.name.split(" ")[0] ?? "Unassigned"}</strong></div>
      </div>

      <div className="relay-lead-timing">
        <CountdownRing ackDeadline={lead.ackDeadline} mode={ringMode} size={44} />
        <div><StatusChip kind={chipKind} /><span>{relativeTime(lead.createdAt)}</span></div>
      </div>

      <div className="relay-lead-actions">
        <button type="button" onClick={onOpenTimeline} className="relay-timeline-action">
          <Icon name="activity" size={15} /> <span>Activity</span>
        </button>
        {canAck && <Button onClick={() => store.acknowledgeLead(lead.id, session!.userId)}>Acknowledge</Button>}
      </div>
    </li>
  );
}
