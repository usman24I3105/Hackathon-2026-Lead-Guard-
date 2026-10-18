export type ChipKind =
  | "waiting" | "acknowledged" | "recovery" | "escalated" | "overdue"
  | "paid" | "pending" | "failed" | "delivered" | "sent" | "queued"
  | "connected" | "error" | "not_configured" | "needs_reconnect" | "expired" | "refunded"
  | "booked" | "cancelled" | "completed";

const MAP: Record<ChipKind, { label: string; icon: string; color: string; bg: string }> = {
  waiting: { label: "Waiting", icon: "⏱", color: "var(--warning-text)", bg: "var(--warn-bg)" },
  escalated: { label: "Escalated", icon: "⚠", color: "var(--alarm)", bg: "var(--alarm-bg)" },
  acknowledged: { label: "Acknowledged", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
  recovery: { label: "Recovery", icon: "⚠", color: "var(--alarm)", bg: "var(--alarm-bg)" },
  overdue: { label: "Overdue", icon: "⚠", color: "var(--alarm)", bg: "var(--alarm-bg)" },
  paid: { label: "Paid", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
  pending: { label: "Pending", icon: "⏱", color: "var(--warning-text)", bg: "var(--warn-bg)" },
  failed: { label: "Failed", icon: "⚠", color: "var(--alarm)", bg: "var(--alarm-bg)" },
  delivered: { label: "Delivered", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
  sent: { label: "Sent", icon: "→", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  queued: { label: "Queued", icon: "…", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  connected: { label: "Connected", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
  error: { label: "Error", icon: "⚠", color: "var(--alarm)", bg: "var(--alarm-bg)" },
  not_configured: { label: "Not configured", icon: "–", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  needs_reconnect: { label: "Needs reconnect", icon: "⚠", color: "var(--warning-text)", bg: "var(--warn-bg)" },
  expired: { label: "Expired", icon: "⏱", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  refunded: { label: "Refunded", icon: "↺", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  booked: { label: "Booked", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
  cancelled: { label: "Cancelled", icon: "–", color: "var(--neutral-text)", bg: "var(--neutral-bg)" },
  completed: { label: "Completed", icon: "✓", color: "var(--safe)", bg: "var(--safe-bg)" },
};

export function StatusChip({ kind, suffix }: { kind: ChipKind; suffix?: string }) {
  const m = MAP[kind];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: m.color, background: m.bg }}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}
