import type { Availability } from "../mock/types";

const CONFIG: Record<Availability, { label: string; text: string; bg: string; icon: string }> = {
  available: { label: "Available", text: "var(--success-text)", bg: "var(--success-bg)", icon: "var(--success)" },
  busy: { label: "Busy", text: "var(--danger-text)", bg: "var(--danger-bg)", icon: "var(--danger)" },
  leave: { label: "On leave", text: "var(--warning-text)", bg: "var(--warning-bg)", icon: "var(--warning)" },
  offline: { label: "Offline", text: "var(--neutral-text)", bg: "var(--neutral-bg)", icon: "var(--neutral-text)" },
};

function Icon({ status, color }: { status: Availability; color: string }) {
  if (status === "leave") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M5 1 L9.5 9 H0.5 Z" fill={color} />
      </svg>
    );
  }
  if (status === "offline") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={color} strokeWidth="1.6">
        <circle cx="5" cy="5" r="3.9" />
        <path d="M2.3 7.7 L7.7 2.3" />
      </svg>
    );
  }
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}

/** Availability as icon + word + color — never color alone. */
export function StatusPill({ status }: { status: Availability }) {
  const c = CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: c.text, background: c.bg }}
    >
      <Icon status={status} color={c.icon} />
      {c.label}
    </span>
  );
}
