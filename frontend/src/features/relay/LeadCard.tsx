import { useEffect, useState } from "react";
import { useAuth } from "../../state/AuthContext";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { CountdownRing } from "../../components/CountdownRing";
import { LevelPips } from "../../components/LevelPips";
import { StatusChip, type ChipKind } from "../../components/StatusChip";
import { Button } from "../../components/Primitives";
import { relativeTime } from "../../lib/format";
import type { Lead } from "../../mock/types";

export function LeadCard({ lead, highlight, onOpenTimeline }: { lead: Lead; highlight: boolean; onOpenTimeline: () => void }) {
  const { team } = useStoreState();
  const { session } = useAuth();
  const owner = team.find((m) => m.id === lead.ownerId);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (highlight) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 650);
      return () => window.clearTimeout(t);
    }
  }, [highlight]);

  const ringMode = lead.status === "acknowledged" ? "acknowledged" : lead.status === "recovery" ? "held" : "running";
  const chipKind: ChipKind = lead.status === "recovery" ? "recovery" : lead.status === "escalated" ? "escalated" : lead.status;
  const canAck = (lead.status === "waiting" || lead.status === "escalated") && lead.ownerId === session?.userId;

  return (
    <li
      className={`flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 border border-line rounded-[10px] bg-surface p-3 sm:p-4 ${flash ? "flash-row" : ""}`}
    >
      {owner && <Avatar name={owner.name} color={owner.avatarColor} availability={owner.availability} />}

      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{lead.name}</span>
          <LevelPips level={lead.level} />
        </div>
        <div className="text-xs text-ink-2 truncate">{lead.phone} · {lead.source}</div>
        <div className="text-sm text-ink-2 truncate mt-0.5 max-w-md">{lead.message}</div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <CountdownRing ackDeadline={lead.ackDeadline} mode={ringMode} />
        <div className="flex flex-col gap-1 items-start min-w-[112px]">
          <StatusChip kind={chipKind} suffix={lead.status === "acknowledged" && lead.ttfrSeconds ? `· ${lead.ttfrSeconds}s TTFR` : undefined} />
          <span className="text-[11px] text-ink-2">{relativeTime(lead.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <button onClick={onOpenTimeline} className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink h-11 sm:h-auto px-2">
          Timeline
        </button>
        {canAck && (
          <Button onClick={() => store.acknowledgeLead(lead.id, session!.userId)}>Acknowledge</Button>
        )}
      </div>
    </li>
  );
}
