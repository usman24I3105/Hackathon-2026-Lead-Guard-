import { useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import type { Lead } from "../../mock/types";

export function LeadTrack({ lead }: { lead: Lead }) {
  const { team } = useStoreState();
  const path = lead.escalationPath.length ? lead.escalationPath : team.map((m) => m.id);
  const idx = Math.max(0, path.indexOf(lead.ownerId));
  const pct = path.length > 1 ? (idx / (path.length - 1)) * 100 : 0;
  const atEnd = lead.status === "acknowledged";

  return (
    <div className="px-4 sm:px-6 py-5 border-b border-line bg-surface">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">
          Live: <span className="text-ink-2">{lead.name}</span>
        </span>
        <span className="text-xs text-ink-2">
          {atEnd ? `Acknowledged in ${lead.ttfrSeconds}s` : `Level ${lead.level} of 3`}
        </span>
      </div>
      <div className="relative h-14">
        <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-line" aria-hidden />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-surface shadow transition-all duration-500"
          style={{
            left: `calc(16px + (100% - 32px) * ${pct / 100})`,
            background: atEnd ? "var(--safe)" : "var(--signal)",
            transform: "translate(-50%, -50%)",
          }}
          aria-hidden
        />
        <div className="relative flex justify-between">
          {path.map((userId, i) => {
            const m = team.find((t) => t.id === userId);
            if (!m) return <span key={userId} />;
            const reached = i <= idx;
            return (
              <div key={userId} className="flex flex-col items-center gap-1" style={{ opacity: reached ? 1 : 0.45 }}>
                <Avatar name={m.name} color={m.avatarColor} size={32} />
                <span className="text-[11px] text-ink-2">{m.name.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
