import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { store, useStoreState } from "../../state/useStore";
import { Avatar } from "../../components/Avatar";
import { Button, Card, EmptyState } from "../../components/Primitives";
import { Icon } from "../../components/icons";
import { PageHeader, SegmentedTabs, StatusBadge } from "../../components/DesignSystem";
import { maskedMoney, relativeTime } from "../../lib/format";
import { has } from "../../lib/perm";
import { useAuth } from "../../state/AuthContext";
import { useToast } from "../../state/ToastContext";
import { Conversation } from "./Conversation";
import { PaymentsPanel } from "./PaymentsPanel";
import { AppointmentsPanel } from "./AppointmentsPanel";

type ActivityKind = "message" | "payment" | "appointment" | "opportunity" | "system";
type ContactActivity = { id: string; at: string; label: string; detail: string; kind: ActivityKind };

export default function Contact360() {
  const { id } = useParams<{ id: string }>();
  const { contacts, companies, opportunities, team, messages, payments, appointments } = useStoreState();
  const { session } = useAuth();
  const { push } = useToast();
  const [activityFilter, setActivityFilter] = useState<"all" | "message" | "payment" | "system">("all");
  const [copiedPhone, setCopiedPhone] = useState(false);
  const contact = contacts.find((c) => c.id === id);

  const activity = useMemo<ContactActivity[]>(() => {
    if (!contact) return [];
    return [
      { id: `contact-${contact.id}`, at: contact.createdAt, label: "Contact added", detail: "Customer record created", kind: "system" as const },
      ...messages.filter((message) => message.contactId === contact.id).map((message) => ({ id: message.id, at: message.at, label: message.direction === "in" ? "Message received" : "Message sent", detail: message.body, kind: "message" as const })),
      ...payments.filter((payment) => payment.contactId === contact.id).map((payment) => ({ id: payment.id, at: payment.createdAt, label: `Payment ${payment.status}`, detail: payment.memo, kind: "payment" as const })),
      ...appointments.filter((appointment) => appointment.contactId === contact.id).map((appointment) => ({ id: appointment.id, at: appointment.start, label: `Appointment ${appointment.status}`, detail: appointment.title, kind: "system" as const })),
      ...opportunities.filter((opportunity) => opportunity.contactId === contact.id).map((opportunity) => ({ id: opportunity.id, at: opportunity.createdAt, label: "Opportunity created", detail: opportunity.title, kind: "opportunity" as const })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [appointments, contact, messages, opportunities, payments]);

  if (!contact) {
    return <div className="page-content"><div className="data-table-card"><EmptyState title="Contact not found" body="It may have been removed or is no longer available." action={<Link to="/contacts" className="app-link">Back to contacts</Link>} /></div></div>;
  }

  const owner = team.find((m) => m.id === contact.ownerId);
  const relatedCompanies = companies.filter((company) => company.contactIds.includes(contact.id));
  const opps = opportunities.filter((opportunity) => opportunity.contactId === contact.id);
  const canSeeValue = !session || has({ role: session.role }, "pipeline.manage") || has({ role: session.role }, "dashboard.full");
  const shownActivity = activity.filter((event) => activityFilter === "all" || (activityFilter === "system" ? ["system", "opportunity"].includes(event.kind) : event.kind === activityFilter));
  const groupedActivity = shownActivity.reduce<Record<string, ContactActivity[]>>((groups, event) => {
    const day = new Date(event.at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    (groups[day] ??= []).push(event);
    return groups;
  }, {});

  async function copyPhone() {
    if (!contact) return;
    try {
      await navigator.clipboard.writeText(contact.phone);
      setCopiedPhone(true);
      window.setTimeout(() => setCopiedPhone(false), 1400);
      push("Phone number copied.", "success");
    } catch {
      push("Phone number could not be copied here.", "error");
    }
  }

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Contact profile"
        title={<span className="profile-title"><Avatar name={contact.name} size={56} /><span>{contact.name}</span></span>}
        subtitle={<div className="contact-meta-row">
          <span className="contact-meta-chip"><Icon name="phone" size={14} /><a className="app-link font-mono-tab" href={`tel:${contact.phone}`}>{contact.phone}</a><button type="button" onClick={copyPhone} aria-label="Copy phone number" title={copiedPhone ? "Copied" : "Copy phone number"}><Icon name={copiedPhone ? "check" : "copy"} size={13} /></button></span>
          {owner && <span className="contact-meta-chip"><Avatar name={owner.name} size={22} color={owner.avatarColor} />Owner: {owner.name}</span>}
          <span className="contact-meta-chip">Contact since {relativeTime(contact.createdAt)}</span>
          {contact.optedOut && <StatusBadge label="Opted out" tone="danger" icon="close" />}
        </div>}
        breadcrumb={<Link to="/contacts" className="app-link">Contacts / {contact.name}</Link>}
        actions={<Button variant={contact.optedOut ? "secondary" : "danger-ghost"} onClick={() => store.toggleOptOut(contact.id, !contact.optedOut)}>{contact.optedOut ? "Re-enable messaging" : "Mark opted out"}</Button>}
      />

      <div className="contact-profile-grid">
        <main className="contact-main-column">
          <section className="contact-section"><div className="contact-section-head"><div><h2>Conversation</h2><p>Messages and delivery history</p></div><Link to="/conversations" className="ui-button ui-button--ghost ui-button--sm">Open inbox</Link></div><Conversation contactId={contact.id} optedOut={contact.optedOut} /></section>
          <section className="contact-section">
            <div className="contact-section-head"><div><h2>Activity timeline</h2><p>Events from this contact record</p></div>
              <SegmentedTabs className="activity-filters" ariaLabel="Filter activity" value={activityFilter} onChange={setActivityFilter} tabs={[{ value: "all", label: "All" }, { value: "message", label: "Messages" }, { value: "payment", label: "Payments" }, { value: "system", label: "System" }]} />
            </div>
            {shownActivity.length ? <div className="contact-timeline">{Object.entries(groupedActivity).map(([day, events]) => <section key={day} className="contact-timeline-day"><h3>{day}</h3><ol>{events.map((event) => <li key={`${event.id}-${event.label}`}><span className={`timeline-icon timeline-icon--${event.kind}`}><Icon name={event.kind === "message" ? "message" : event.kind === "payment" ? "payments" : event.kind === "opportunity" ? "opportunities" : "activity"} size={14} /></span><div className="timeline-event-copy"><div className="timeline-event-heading"><strong>{event.label}</strong><time dateTime={event.at} title={new Date(event.at).toLocaleString()}>{relativeTime(event.at)}</time></div><p>{event.detail}</p></div></li>)}</ol></section>)}</div> : <EmptyState title="No activity in this view" body="Try another activity filter or check back later." />}
          </section>
        </main>

        <aside className="contact-info-rail" aria-label="Contact details">
          <Card className="contact-rail-card"><div className="contact-section-head"><div><h2>Associated companies</h2><p>Account relationships</p></div><span className="rail-count">{relatedCompanies.length}</span></div>
            {relatedCompanies.length ? <ul className="contact-rail-list">{relatedCompanies.map((company) => <li key={company.id}><Link to={`/companies/${company.id}`} className="company-rail-link"><span className="company-rail-mark">{company.name.trim().slice(0, 1).toUpperCase()}</span><span className="truncate">{company.name}</span><Icon name="arrow-right" size={14} /></Link></li>)}</ul> : <p className="contact-rail-empty">No company associated</p>}
            <Link to="/companies" className="ui-button ui-button--ghost ui-button--sm">Browse companies</Link>
          </Card>

          <Card className="contact-rail-card"><div className="contact-section-head"><div><h2>Opportunities</h2><p>Open and recent work</p></div><span className="rail-count">{opps.length}</span></div>
            {opps.length ? <ul className="contact-rail-list">{opps.map((opportunity) => <li key={opportunity.id}><div className="contact-opp-row"><div className="min-w-0"><strong title={opportunity.title}>{opportunity.title}</strong><small>{relativeTime(opportunity.createdAt)}</small></div>{canSeeValue ? <span className="font-mono-tab text-xs">{maskedMoney(opportunity.valueCents, true)}</span> : <span className="restricted-value"><Icon name="lock" size={13} />Restricted</span>}</div></li>)}</ul> : <p className="contact-rail-empty">No opportunities yet</p>}
          </Card>

          <Card className="contact-rail-card"><PaymentsPanel contactId={contact.id} /></Card>
          <Card className="contact-rail-card"><AppointmentsPanel contactId={contact.id} /></Card>
        </aside>
      </div>
    </div>
  );
}
