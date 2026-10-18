import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import type { Availability } from "../../mock/types";

const OPTIONS: Availability[] = ["available", "busy", "leave", "offline"];

export function TeamStrip() {
  const { team, leads } = useStoreState();
  const { session } = useAuth();
  const available = team.filter((member) => member.availability === "available").length;

  return (
    <section className="relay-roster" aria-labelledby="relay-roster-title">
      <div className="relay-roster-heading">
        <div>
          <h2 id="relay-roster-title">On shift</h2>
          <p>{available} of {team.length} available</p>
        </div>
      </div>
      <ul className="relay-roster-list">
        {team.map((member) => {
          const activeCount = leads.filter((lead) => lead.ownerId === member.id && (lead.status === "waiting" || lead.status === "escalated")).length;
          const isMe = member.id === session?.userId;
          return (
            <li key={member.id} className="relay-roster-member">
              <Avatar name={member.name} color={member.avatarColor} size={36} availability={member.availability} title={`${member.name} · ${member.availability}`} />
              <div className="relay-roster-person">
                <span className="relay-roster-name">{member.name.split(" ")[0]}{isMe ? <span className="relay-you">You</span> : null}</span>
                {isMe ? (
                  <label className="relay-availability-label">
                    <span className="sr-only">Your availability</span>
                    <select
                      aria-label="Your availability"
                      value={member.availability}
                      onChange={(event) => store.setAvailability(member.id, event.target.value as Availability)}
                    >
                      {OPTIONS.map((option) => (
                        <option key={option} value={option}>{option === "leave" ? "On leave" : option[0].toUpperCase() + option.slice(1)}</option>
                      ))}
                    </select>
                    <span className={`relay-availability-dot is-${member.availability}`} aria-hidden="true" />
                  </label>
                ) : (
                  <span className="relay-roster-status"><span className={`relay-availability-dot is-${member.availability}`} aria-hidden="true" />{member.availability === "leave" ? "On leave" : member.availability[0].toUpperCase() + member.availability.slice(1)}</span>
                )}
              </div>
              <span className="relay-roster-workload" aria-label={`${activeCount} active leads`}>
                <strong>{activeCount}</strong><span>{activeCount === 1 ? "lead" : "leads"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
