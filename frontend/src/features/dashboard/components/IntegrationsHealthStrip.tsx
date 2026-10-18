import type { ActivityChannel, IntegrationHealth } from "../../../api/types/dashboard";
import { ChannelIcon } from "../../../components/ChannelIcon";
import { relativeTime } from "../../../lib/format";

function statusLine(i: IntegrationHealth): { text: string; color: string; warn: boolean } {
  switch (i.status) {
    case "connected":
      return {
        text: i.lastSuccessAt ? `Connected · synced ${relativeTime(i.lastSuccessAt)}` : "Connected",
        color: "var(--success-text)",
        warn: false,
      };
    case "error":
    case "needs_reconnect":
      return {
        text: i.lastSuccessAt
          ? `Needs attention · last synced ${relativeTime(i.lastSuccessAt)}`
          : i.lastErrorAt
            ? `Needs attention · failed ${relativeTime(i.lastErrorAt)}`
            : "Needs attention",
        color: "var(--danger-text)",
        warn: true,
      };
    default:
      return { text: "Not set up", color: "var(--neutral-text)", warn: false };
  }
}

export function IntegrationsHealthStrip({ items }: { items: IntegrationHealth[] }) {
  return (
    <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((i) => {
        const line = statusLine(i);
        return (
          <li key={i.key} className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-bg">
              <ChannelIcon channel={i.key as ActivityChannel} size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">{i.name}</p>
              <p className="text-xs font-medium flex items-center gap-1" style={{ color: line.color }}>
                {line.warn && <span aria-hidden="true">⚠</span>}
                <span className="truncate">{line.text}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
