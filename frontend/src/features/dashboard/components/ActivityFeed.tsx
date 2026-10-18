import type { ActivityItem } from "../../../api/types/dashboard";
import { ChannelIcon } from "../../../components/ChannelIcon";
import { relativeTime } from "../../../lib/format";

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-bg">
            <ChannelIcon channel={item.channel} size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text">{item.text}</p>
            <time dateTime={item.at} className="text-xs text-text-muted">{relativeTime(item.at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
