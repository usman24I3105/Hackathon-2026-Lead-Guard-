import type { UpcomingAppointment } from "../../../api/types/dashboard";
import { ChannelIcon } from "../../../components/ChannelIcon";
import { clock, dateLabel } from "../../../lib/format";

export function UpcomingAppointments({
  items,
  onSelectContact,
}: {
  items: UpcomingAppointment[];
  onSelectContact?: (contactId: string) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="flex flex-col">
            <span className="font-mono-tab text-sm font-medium text-text">{clock(a.start)}</span>
            <span className="text-xs text-text-muted">{dateLabel(a.start)}</span>
          </div>
          <div className="min-w-0">
            {onSelectContact ? (
              <button
                type="button"
                onClick={() => onSelectContact(a.contactId)}
                className="text-sm font-medium text-text hover:text-primary hover:underline underline-offset-2 truncate max-w-full text-left"
              >
                {a.customerName}
              </button>
            ) : (
              <span className="text-sm font-medium text-text truncate block">{a.customerName}</span>
            )}
            <p className="text-xs text-text-muted truncate">{a.title} · {a.employeeName}</p>
          </div>
          <ChannelIcon channel={a.provider} />
        </li>
      ))}
    </ul>
  );
}
