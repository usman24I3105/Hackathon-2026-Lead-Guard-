import type { RecoveryItem } from "../../../api/types/dashboard";
import { formatMmSs, useCountdown } from "../../../lib/useCountdown";
import { relativeTime } from "../../../lib/format";
import { Button } from "../../../components/Primitives";

function OwnerCountdown({ item }: { item: RecoveryItem }) {
  const left = useCountdown(item.status === "recovery" ? null : item.ackDeadline);
  const overdue = item.overdue || left === 0;
  return (
    <div className="flex flex-col">
      <span className="text-sm text-text">{item.ownerName}</span>
      <span
        className="font-mono-tab text-xs font-medium"
        style={{ color: overdue ? "var(--danger-text)" : "var(--warning-text)" }}
        aria-label={overdue ? "Overdue" : `${left} seconds left`}
      >
        {overdue ? "⚠ Overdue" : `⏱ ${formatMmSs(left)}`}
      </span>
    </div>
  );
}

export function OverdueBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-danger-text bg-danger-bg whitespace-nowrap">
      {count} overdue
    </span>
  );
}

export function RecoveryQueueTable({
  items,
  currentUserId,
  onAcknowledge,
  onReassign,
}: {
  items: RecoveryItem[];
  currentUserId: string | undefined;
  onAcknowledge: (item: RecoveryItem) => void;
  onReassign: (item: RecoveryItem) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Lead</th>
            <th scope="col" className="py-2 pr-3 font-medium">Source</th>
            <th scope="col" className="py-2 pr-3 font-medium">Reason</th>
            <th scope="col" className="py-2 pr-3 font-medium">Current owner</th>
            <th scope="col" className="py-2 pr-3 font-medium">Time waiting</th>
            <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOwner = item.ownerId === currentUserId;
            return (
              <tr key={item.leadId} className="border-b border-border last:border-0 align-top transition-colors hover:bg-neutral-bg/60">
                <td className="py-3 pr-3 font-medium text-text">{item.leadName}</td>
                <td className="py-3 pr-3 text-text-muted">{item.source}</td>
                <td className="py-3 pr-3 text-text-muted max-w-[14rem]">{item.reason}</td>
                <td className="py-3 pr-3"><OwnerCountdown item={item} /></td>
                <td className="py-3 pr-3 text-text-muted whitespace-nowrap">{relativeTime(item.createdAt).replace(" ago", "")}</td>
                <td className="py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      className="h-9! px-3"
                      disabled={!isOwner}
                      title={isOwner ? undefined : `Only ${item.ownerName} can acknowledge — reassign instead`}
                      onClick={() => onAcknowledge(item)}
                    >
                      Acknowledge
                      {!isOwner && <span className="sr-only"> (only {item.ownerName} can acknowledge)</span>}
                    </Button>
                    <Button variant="secondary" className="h-9! px-3" onClick={() => onReassign(item)}>
                      Reassign<span className="sr-only"> {item.leadName}</span>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
