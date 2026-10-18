import { useCallback, useId, useRef, useState } from "react";
import type { AuditEntry } from "../../mock/types";
import { Icon } from "../icons";
import { relativeTime } from "../../lib/format";
import { useDismiss } from "./useDismiss";

export function ActivityPopover({
  audit,
  unreadCount,
  onViewed,
  onViewAudit,
}: {
  audit: AuditEntry[];
  unreadCount: number;
  onViewed: () => void;
  onViewAudit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close, triggerRef);

  return (
    <div className="activity-popover relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) onViewed();
          setOpen((value) => !value);
        }}
        aria-label={"Recent activity" + (unreadCount ? ", " + unreadCount + " unread" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className="activity-trigger"
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && <span className="activity-unread-dot" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Recent activity" className="activity-panel">
          <div className="activity-panel-heading">
            <div><h2>Recent activity</h2><p>Changes across your workspace</p></div>
            {unreadCount > 0 && <span>{unreadCount} new</span>}
          </div>
          {audit.length ? audit.slice(0, 5).map((event, index) => (
            <div key={event.id} className="activity-event">
              <span className={"activity-event-dot" + (index < unreadCount ? " is-unread" : "")} aria-hidden="true" />
              <div className="activity-event-copy">
                <p>{event.type.replaceAll(".", " ")}</p>
                <span>{event.userName} · {relativeTime(event.at)}</span>
              </div>
            </div>
          )) : <p className="activity-empty">No activity recorded yet.</p>}
          <button type="button" onClick={() => { setOpen(false); onViewAudit(); }} className="activity-view-all">
            View audit log <Icon name="arrow-right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
