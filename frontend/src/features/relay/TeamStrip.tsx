import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import type { Availability } from "../../mock/types";

const OPTIONS: Availability[] = ["available", "busy", "leave", "offline"];

export function TeamStrip() {
  const { team, leads } = useStoreState();
  const { session } = useAuth();

  return (
    <div className="flex items-center gap-4 overflow-x-auto px-4 sm:px-6 py-4 border-b border-line bg-surface">
      {team.map((m) => {
        const activeCount = leads.filter((l) => l.ownerId === m.id && (l.status === "waiting" || l.status === "escalated")).length;
        const isMe = m.id === session?.userId;
        return (
          <div key={m.id} className="flex flex-col items-center gap-1.5 shrink-0 min-w-[84px]">
            <div className="relative">
              <Avatar name={m.name} color={m.avatarColor} size={48} availability={m.availability} />
              {activeCount > 0 && (
                <span
                  className="absolute -top-1 -left-1 flex items-center justify-center rounded-full bg-alarm text-white text-[10px] font-semibold"
                  style={{ width: 18, height: 18 }}
                  aria-label={`${activeCount} active leads`}
                >
                  {activeCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-ink text-center leading-tight">{m.name.split(" ")[0]}</span>
            {isMe ? (
              <select
                aria-label="Your availability"
                value={m.availability}
                onChange={(e) => store.setAvailability(m.id, e.target.value as Availability)}
                className="text-[11px] rounded-full border border-line px-2 py-0.5 bg-paper"
              >
                {OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o === "leave" ? "On leave" : o[0].toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-ink-2">{m.availability === "leave" ? "On leave" : m.availability[0].toUpperCase() + m.availability.slice(1)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
