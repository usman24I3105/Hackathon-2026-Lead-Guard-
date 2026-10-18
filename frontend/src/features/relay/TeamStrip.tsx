import { Link } from "react-router-dom";
import { useAuth } from "../../state/AuthContext";
import { useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/icons";
import { AvailabilityMenu } from "./RelayUi";
import { availabilityText } from "./relayFormat";

export function TeamStrip() {
  const { team, leads } = useStoreState();
  const { session } = useAuth();
  const available = team.filter((member) => member.availability === "available").length;

  return (
    <section className="relay-roster" aria-labelledby="relay-roster-title">
      <div className="relay-roster-heading">
        <div>
          <h2 id="relay-roster-title">Team availability</h2>
          <p>{available} of {team.length} ready to receive a lead</p>
        </div>
        <div className="relay-roster-heading-actions">
          <Link to="/team" className="relay-team-manage-link" aria-label="Manage team availability" title="Manage team availability">
            Manage <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
      {team.length ? (
        <ul className="relay-roster-list" aria-label="Team members and current workloads">
          {team.map((member) => {
            const activeCount = leads.filter((lead) => lead.ownerId === member.id && (lead.status === "waiting" || lead.status === "escalated")).length;
            const isMe = member.id === session?.userId;
            const statusClass = member.availability === "available" ? "available" : member.availability === "busy" ? "busy" : "away";
            return (
              <li key={member.id} className="relay-roster-member">
                <Avatar name={member.name} color={member.avatarColor} size={36} availability={member.availability} title={member.name + " · " + availabilityText(member.availability)} />
                <div className="relay-roster-person">
                  <div className="relay-roster-name" title={member.name}>
                    <span>{member.name}</span>
                    {isMe && <span className="relay-you">You</span>}
                  </div>
                  {isMe ? (
                    <AvailabilityMenu memberId={member.id} availability={member.availability} />
                  ) : (
                    <span className={`relay-roster-status is-${statusClass}`}>
                      <span className={"relay-availability-dot is-" + member.availability} aria-hidden="true" />
                      {availabilityText(member.availability)}
                    </span>
                  )}
                </div>
                <span className="relay-workload-chip" aria-label={activeCount + " active leads"}>
                  <strong>{activeCount}</strong><span>active</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="relay-roster-empty">Team availability will appear here when teammates are added.</div>
      )}
    </section>
  );
}
