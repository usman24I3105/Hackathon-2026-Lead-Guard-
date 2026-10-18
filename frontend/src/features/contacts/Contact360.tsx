import { useParams, Link } from "react-router-dom";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Card, EmptyState } from "../../components/Primitives";
import { maskedMoney, relativeTime } from "../../lib/format";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { Conversation } from "./Conversation";
import { PaymentsPanel } from "./PaymentsPanel";
import { AppointmentsPanel } from "./AppointmentsPanel";

export default function Contact360() {
  const { id } = useParams<{ id: string }>();
  const { contacts, opportunities, team } = useStoreState();
  const { session } = useAuth();
  const contact = contacts.find((c) => c.id === id);

  if (!contact) {
    return <EmptyState title="Contact not found." body="It may have been removed." action={<Link to="/contacts" className="text-focus underline">Back to contacts</Link>} />;
  }

  const owner = team.find((m) => m.id === contact.ownerId);
  const opps = opportunities.filter((o) => o.contactId === contact.id);
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage") || has({ role: session.role }, "dashboard.full");

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <Link to="/contacts" className="text-sm text-ink-2 underline underline-offset-2 mb-4 inline-block">← Contacts</Link>

      <header className="flex items-center gap-4 mb-6">
        <Avatar name={contact.name} color="#4B5563" size={48} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {contact.name}
            {contact.optedOut && <span className="text-xs text-alarm bg-alarm-bg rounded-full px-2 py-0.5">Opted out</span>}
          </h1>
          <p className="text-sm text-ink-2">{contact.phone} · Owner: {owner?.name} · Contact since {relativeTime(contact.createdAt)}</p>
        </div>
        <button
          onClick={() => store.toggleOptOut(contact.id, !contact.optedOut)}
          className="text-sm underline underline-offset-2 text-ink-2 hover:text-ink shrink-0"
        >
          {contact.optedOut ? "Re-enable messaging" : "Mark opted out"}
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <Conversation contactId={contact.id} optedOut={contact.optedOut} />

          <div>
            <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wide mb-3">Opportunities</h3>
            {opps.length === 0 ? (
              <p className="text-sm text-ink-2">No opportunities yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {opps.map((o) => (
                  <li key={o.id}>
                    <Card className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{o.title}</div>
                        <div className="text-xs text-ink-2">{relativeTime(o.createdAt)}</div>
                      </div>
                      <span className="font-mono-tab text-sm shrink-0">{maskedMoney(o.valueCents, canSeeValue)}</span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <PaymentsPanel contactId={contact.id} />
          <AppointmentsPanel contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}
