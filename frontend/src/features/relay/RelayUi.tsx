import { useCallback, useLayoutEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/icons";
import { Button } from "../../components/Primitives";
import { store } from "../../state/useStore";
import { useDismiss } from "../../components/shell/useDismiss";
import { usePortalPosition } from "../../components/usePortalPosition";
import type { Availability } from "../../mock/types";
import { availabilityText } from "./relayFormat";

const AVAILABILITY_OPTIONS: Availability[] = ["available", "busy", "offline"];

export function AvailabilityMenu({ memberId, availability }: { memberId: string; availability: Availability }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const menuPosition = usePortalPosition(open, triggerRef, menuRef, "bottom-start", 6);
  useDismiss(open, rootRef, close, triggerRef, menuRef);

  useLayoutEffect(() => {
    if (open && menuPosition.visibility === "visible") {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    }
  }, [open, menuPosition.visibility]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % options.length;
    if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next >= 0) {
      event.preventDefault();
      options[next]?.focus();
    }
  }

  return (
    <div className="relay-availability" ref={rootRef}>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        className={`relay-availability-trigger is-${availability === "available" ? "available" : availability === "busy" ? "busy" : "away"}`}
        aria-label={"Your availability: " + availabilityText(availability)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        leadingIcon={<span className={"relay-availability-dot is-" + availability} aria-hidden="true" />}
        trailingIcon={<Icon name="chevron-down" size={13} />}
        onClick={() => setOpen((value) => !value)}
      >
        {availabilityText(availability)}
      </Button>
      {open && createPortal(
        <div ref={menuRef} id={menuId} className="relay-availability-menu" style={menuPosition} role="menu" aria-label="Set your availability" onKeyDown={onMenuKeyDown}>
          {AVAILABILITY_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="md"
              className="relay-menu-item"
              role="menuitemradio"
              aria-checked={option === availability || (option === "offline" && availability === "leave")}
              onClick={() => {
                store.setAvailability(memberId, option);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span className={"relay-availability-dot is-" + option} aria-hidden="true" />
              <span>{availabilityText(option)}</span>
              {(option === availability || (option === "offline" && availability === "leave")) && <Icon name="check" size={15} />}
            </Button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function SourceChip({ source }: { source: string }) {
  const normalized = source.toLowerCase();
  const label = normalized.includes("form") ? "Public form" : normalized.includes("manual") ? "Manual entry" : source;
  return <span className="relay-source-chip"><Icon name={normalized.includes("form") ? "list" : "plus"} size={13} />{label}</span>;
}

export function PriorityBadge({ level, escalated }: { level: number; escalated: boolean }) {
  const priority = escalated || level >= 3 ? "high" : level === 2 ? "medium" : "standard";
  const label = priority === "standard" ? "Standard" : priority === "medium" ? "Priority" : "Urgent";
  const accessible = priority === "standard" ? "Standard" : priority === "medium" ? "Medium" : "High";
  return (
    <span className={"relay-priority-badge is-" + priority} aria-label={accessible + " priority, escalation level " + level}>
      <span aria-hidden="true" />{label}
    </span>
  );
}

export function RelayStatusBadge({ status }: { status: "waiting" | "escalated" | "acknowledged" | "recovery" }) {
  const details = {
    waiting: { label: "Waiting", icon: "clock", className: "is-waiting" },
    escalated: { label: "Escalated", icon: "warning", className: "is-escalated" },
    acknowledged: { label: "Acknowledged", icon: "check", className: "is-acknowledged" },
    recovery: { label: "Recovery", icon: "history", className: "is-recovery" },
  }[status];
  return (
    <span className={"relay-status-badge " + details.className}>
      <Icon name={details.icon as "clock" | "warning" | "check" | "history"} size={13} />
      {details.label}
    </span>
  );
}

export function RelayLoadingState() {
  return (
    <div className="relay-state-panel" role="status" aria-label="Loading live relay">
      <div className="relay-state-heading"><span className="relay-skeleton relay-skeleton-title" /><span className="relay-skeleton relay-skeleton-pill" /></div>
      <div className="relay-state-kpis">{[0, 1, 2].map((item) => <span key={item} className="relay-skeleton relay-skeleton-kpi" />)}</div>
      <div className="relay-state-row"><span className="relay-skeleton relay-skeleton-avatar" /><span className="relay-skeleton relay-skeleton-copy" /><span className="relay-skeleton relay-skeleton-chip" /></div>
      <div className="relay-state-row"><span className="relay-skeleton relay-skeleton-avatar" /><span className="relay-skeleton relay-skeleton-copy" /><span className="relay-skeleton relay-skeleton-chip" /></div>
      <span className="sr-only">Loading leads and team availability…</span>
    </div>
  );
}

export function RelayErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="relay-error-state" role="alert">
      <span className="relay-error-icon"><Icon name="info" size={19} /></span>
      <div><h2>The relay preview couldn’t load</h2><p>Your workspace data is safe. Return to the sample view to keep reviewing.</p></div>
      <Button type="button" variant="secondary" size="lg" onClick={onRetry}>Retry preview</Button>
    </div>
  );
}
