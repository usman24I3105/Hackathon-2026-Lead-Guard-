import type { CSSProperties } from "react";
import { Avatar } from "../../components/Avatar";
import { CountdownRing } from "../../components/CountdownRing";
import { StatusChip } from "../../components/StatusChip";
import { useStoreState } from "../../state/useStore";
import type { Lead } from "../../mock/types";

export function LeadTrack({ lead }: { lead: Lead }) {
  const { team } = useStoreState();
  const path = lead.escalationPath.length ? lead.escalationPath : team.map((member) => member.id);
  const index = Math.max(0, path.indexOf(lead.ownerId));
  const progress = path.length > 1 ? (index / (path.length - 1)) * 100 : 0;
  const owner = team.find((member) => member.id === lead.ownerId);
  const isEscalated = lead.status === "escalated";
  const pathStyle = {
    "--relay-stops": Math.max(path.length, 1),
    "--relay-inset": `${path.length > 1 ? 50 / path.length : 50}%`,
  } as CSSProperties;

  return (
    <section className="relay-handoff" aria-labelledby="relay-handoff-title">
      <div className="relay-handoff-main">
        <div className="relay-handoff-copy">
          <div className="relay-handoff-label">
            <span className="relay-live-dot" aria-hidden="true" />
            <span>Live handoff</span>
            <StatusChip kind={isEscalated ? "escalated" : "waiting"} />
          </div>
          <h2 id="relay-handoff-title">{lead.name}</h2>
          <p>{lead.source} enquiry <span aria-hidden="true">·</span> {owner ? `Owned by ${owner.name}` : "Owner not assigned"}</p>
        </div>
        <div className="relay-handoff-timer">
          <CountdownRing ackDeadline={lead.ackDeadline} mode={isEscalated ? "overdue" : "running"} size={48} />
          <div><strong>{isEscalated ? "Response overdue" : "Response window"}</strong><span>{isEscalated ? `Escalation ${lead.level} of 3` : "Waiting for acknowledgement"}</span></div>
        </div>
      </div>

      <div className="relay-path" style={pathStyle} aria-label={`Handoff path, current owner ${owner?.name ?? "unassigned"}`}>
        <div className="relay-path-rail" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        {path.map((userId, step) => {
          const member = team.find((person) => person.id === userId);
          if (!member) return <span key={userId} />;
          const reached = step <= index;
          const current = step === index;
          return (
            <div key={userId} className={`relay-path-stop ${reached ? "is-reached" : ""} ${current ? "is-current" : ""}`}>
              <div className="relay-path-avatar"><Avatar name={member.name} color={member.avatarColor} size={30} /></div>
              <span className="relay-path-name">{member.name.split(" ")[0]}</span>
              <span className="relay-path-role">{current ? "Current owner" : step < index ? "Previous owner" : `Escalation ${step + 1}`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
