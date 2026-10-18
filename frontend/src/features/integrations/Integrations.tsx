import { useStoreState } from "../../state/useStore";
import { useAuth } from "../../state/AuthContext";
import { has } from "../../lib/perm";
import { IntegrationCard } from "./IntegrationCard";
import { clock, dateLabel } from "../../lib/format";

export default function Integrations() {
  const { integrations, audit } = useStoreState();
  const { session } = useAuth();
  const canManage = !session || has({ role: session.role }, "integrations.manage");
  const events = audit.filter((a) => ["payment.created", "lead.escalated"].includes(a.type)).slice(0, 10);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-ink-2">What's connected, and what it can and can't do.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {integrations.map((i) => (
          <IntegrationCard key={i.key} integration={i} canManage={canManage} />
        ))}
      </div>

      <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Event log</h2>
      <div className="bg-surface border border-line rounded-[10px] divide-y divide-line">
        {events.length === 0 ? (
          <p className="text-sm text-ink-2 p-4">No integration events yet.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{e.type}</span>
              <span className="text-xs text-ink-2">{dateLabel(e.at)}, {clock(e.at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
