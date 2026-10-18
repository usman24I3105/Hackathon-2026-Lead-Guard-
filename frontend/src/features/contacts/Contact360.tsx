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
  const { contacts, companies, opportunities, team, messages, payments, appointments } = useStoreState();
  const { session } = useAuth();
  const contact = contacts.find((c) => c.id === id);

  if (!contact) {
    return <EmptyState title="Contact not found." body="It may have been removed." action={<Link to="/contacts" className="text-focus underline">Back to contacts</Link>} />;
  }

  const owner = team.find((m) => m.id === contact.ownerId);
  const relatedCompanies = companies.filter((company) => company.contactIds.includes(contact.id));
  const opps = opportunities.filter((o) => o.contactId === contact.id);
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage") || has({ role: session.role }, "dashboard.full");
  const activity = [
    { id: `contact-${contact.id}`, at: contact.createdAt, label: "Contact added", detail: "Customer record created" },
    ...messages.filter((message) => message.contactId === contact.id).map((message) => ({
      id: message.id, at: message.at, label: message.direction === "in" ? "Message received" : "Message sent", detail: message.body,
    })),
    ...payments.filter((payment) => payment.contactId === contact.id).map((payment) => ({
      id: payment.id, at: payment.createdAt, label: `Payment ${payment.status}`, detail: payment.memo,
    })),
    ...appointments.filter((appointment) => appointment.contactId === contact.id).map((appointment) => ({
      id: appointment.id, at: appointment.start, label: `Appointment ${appointment.status}`, detail: appointment.title,
    })),
    ...opps.map((opportunity) => ({
      id: opportunity.id, at: opportunity.createdAt, label: "Opportunity created", detail: opportunity.title,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <Link to="/contacts" className="text-sm text-ink-2 underline underline-offset-2 mb-4 inline-block">← Contacts</Link>

      <header className="flex items-center gap-4 mb-6">
        <Avatar name={contact.name} color="var(--neutral-text)" size={48} />
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

      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-40 flex-1"><p className="text-xs font-medium text-text-muted">Associated companies</p>
          {relatedCompanies.length ? <div className="mt-1 flex flex-wrap gap-2">{relatedCompanies.map((company) => <Link key={company.id} to={`/companies/${company.id}`} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary hover:underline">{company.name}</Link>)}</div> : <p className="mt-1 text-sm text-text-muted">No company linked</p>}
        </div>
        <Link to="/companies" className="text-sm font-medium text-primary hover:underline">Browse companies</Link>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-6">
          <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-text-muted">Conversation</h2><Link to="/conversations" className="text-xs font-medium text-primary hover:underline">Open inbox</Link></div><Conversation contactId={contact.id} optedOut={contact.optedOut} /></section>

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

      <section className="mt-7 max-w-5xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Activity timeline</h2><span className="text-xs text-text-muted">Chronological events from available records</span></div>
        {activity.length ? <ol className="relative ml-2 border-l border-border pl-5">{activity.map((event) => <li key={`${event.id}-${event.label}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.42rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" /><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-sm font-medium">{event.label}</p><time className="text-xs text-text-muted" dateTime={event.at} title={new Date(event.at).toLocaleString()}>{relativeTime(event.at)}</time></div><p className="mt-1 text-sm text-text-muted">{event.detail}</p></li>)}</ol> : <EmptyState title="No activity recorded." body="Messages, appointments, and opportunities will build this timeline." />}
      </section>
    </div>
  );
}
