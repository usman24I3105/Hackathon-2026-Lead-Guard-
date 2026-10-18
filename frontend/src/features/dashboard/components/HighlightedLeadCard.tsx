import type { RecoveryItem } from "../../../api/types/dashboard";
import { formatMmSs, useCountdown } from "../../../lib/useCountdown";
import { Button } from "../../../components/Primitives";

/** Announce only at a few thresholds — never every tick (no screen-reader spam). */
function announcement(left: number, overdue: boolean): string {
  if (overdue || left === 0) return "Overdue — no acknowledgement yet.";
  if (left <= 10) return "10 seconds left to acknowledge.";
  if (left <= 30) return "30 seconds left to acknowledge.";
  return "";
}

export function HighlightedLeadCard({
  item,
  canAcknowledge,
  onAcknowledge,
  onReassign,
}: {
  item: RecoveryItem;
  canAcknowledge: boolean;
  onAcknowledge: (item: RecoveryItem) => void;
  onReassign: (item: RecoveryItem) => void;
}) {
  const left = useCountdown(item.status === "recovery" ? null : item.ackDeadline);
  const overdue = item.overdue || left === 0;

  return (
    <article
      className="rounded-card border-2 bg-surface shadow-card p-4 flex flex-col gap-3"
      style={{ borderColor: "var(--danger)" }}
      aria-labelledby={`hl-${item.leadId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`hl-${item.leadId}`} className="text-base font-semibold text-text truncate">{item.leadName}</h3>
          <p className="text-sm text-text-muted">{item.source} · owner {item.ownerName}</p>
        </div>
        <span
          role="timer"
          className="font-mono-tab text-2xl font-semibold shrink-0"
          style={{ color: "var(--danger-text)" }}
          aria-label={overdue ? "Overdue" : `${left} seconds left`}
        >
          {overdue ? "00:00" : formatMmSs(left)}
        </span>
      </div>

      <p className="text-sm text-text-muted">{item.reason}</p>

      <div aria-live="polite" className="sr-only">
        {announcement(left, overdue)}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!canAcknowledge}
          title={canAcknowledge ? undefined : `Only ${item.ownerName} can acknowledge — reassign instead`}
          onClick={() => onAcknowledge(item)}
        >
          Acknowledge
          {!canAcknowledge && <span className="sr-only"> (only {item.ownerName} can acknowledge)</span>}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => onReassign(item)}>
          Reassign
        </Button>
      </div>
    </article>
  );
}
