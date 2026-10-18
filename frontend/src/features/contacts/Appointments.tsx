import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, FormField, Input, Select } from "../../components/Primitives";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FilterBar, Notice, PageHeader, SegmentedTabs, StatusBadge, Tooltip } from "../../components/DesignSystem";
import { Icon } from "../../components/icons";
import { clock, dateLabel } from "../../lib/format";
import { store, useStoreState } from "../../state/useStore";
import { useToast } from "../../state/ToastContext";

function localDateTimeMinimum() {
  const next = new Date(Date.now() + 60_000);
  next.setSeconds(0, 0);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Appointments() {
  const { appointments, contacts, integrations } = useStoreState();
  const { push } = useToast();
  const calendarReady = integrations.find((integration) => integration.key === "google")?.status === "connected";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dateTab, setDateTab] = useState<"upcoming" | "past">("upcoming");
  const [pageOpenedAt] = useState(() => Date.now());
  const [createOpen, setCreateOpen] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [title, setTitle] = useState("Inspection");
  const [start, setStart] = useState("");
  const [minimumStart] = useState(localDateTimeMinimum);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const rows = useMemo(() => appointments.filter((appointment) => {
    if (status !== "all" && appointment.status !== status) return false;
    const isUpcoming = new Date(appointment.start).getTime() >= pageOpenedAt;
    if (dateTab === "upcoming" ? !isUpcoming : isUpcoming) return false;
    const contact = contacts.find((person) => person.id === appointment.contactId);
    return `${appointment.title} ${contact?.name ?? ""} ${contact?.phone ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [appointments, contacts, dateTab, pageOpenedAt, query, status]);

  function book(event: FormEvent) {
    event.preventDefault();
    const startAt = new Date(start);
    if (!calendarReady || !contactId || !title.trim() || Number.isNaN(startAt.getTime()) || startAt.getTime() <= Date.now()) return;
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    try {
      store.bookAppointment(contactId, title.trim(), startAt.toISOString(), endAt.toISOString());
      push("Appointment booked.", "success");
      setCreateOpen(false); setStart(""); setTitle("Inspection");
    } catch (error) {
      push(error instanceof Error ? error.message : "Calendar booking is unavailable.", "error");
    }
  }

  const cancel = useCallback(() => {
    if (!cancelId) return;
    try {
      store.cancelAppointment(cancelId);
      push("Appointment cancellation requested.", "info");
    } catch (error) {
      push(error instanceof Error ? error.message : "Appointment could not be cancelled.", "error");
    }
    setCancelId(null);
  }, [cancelId, push]);

  return <div className="page-content">
    <PageHeader eyebrow="Communication" title="Appointments" subtitle="Keep inspections and follow-ups coordinated with customer records." actions={calendarReady ? <Button onClick={() => setCreateOpen((open) => !open)}>Book appointment</Button> : <Tooltip content="Connect Google Calendar to book appointments"><span><Button disabled>Book appointment</Button></span></Tooltip>} />
    {!calendarReady && <Notice variant="warning" className="mb-4" action={<Link to="/integrations" className="ui-button ui-button--secondary ui-button--sm">Connect Google Calendar</Link>}>Google Calendar needs to be connected before appointments can be booked.</Notice>}
    {createOpen && <Card className="mb-4 p-4"><form onSubmit={book} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
      <FormField label="Contact" htmlFor="appointment-contact" required><Select id="appointment-contact" value={contactId} onChange={(event) => setContactId(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</Select></FormField>
      <FormField label="Appointment title" htmlFor="appointment-title" required><Input id="appointment-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></FormField>
      <FormField label="Start date and time" htmlFor="appointment-start" required><Input id="appointment-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} min={minimumStart} required /></FormField>
      <div className="flex gap-2"><Button type="submit" disabled={!calendarReady || !contactId || !title.trim() || !start}>Book one-hour slot</Button><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button></div>
    </form><p className="mt-3 text-xs text-text-muted">Availability and the final booking response come from the calendar integration.</p></Card>}
    <FilterBar className="mb-3"><Input aria-label="Search appointments" placeholder="Search customer or appointment…" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1 sm:max-w-[360px]" /><Select aria-label="Filter appointments by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></FilterBar>
    <SegmentedTabs as="nav" className="saved-view-tabs" ariaLabel="Appointment date range" value={dateTab} onChange={setDateTab} tabs={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />
    <div className="data-table-card appointment-table">
      {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Appointment", "Contact", "Date & time", "Status", "Action"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((appointment) => {
        const contact = contacts.find((person) => person.id === appointment.contactId);
        const startMs = new Date(appointment.start).getTime(); const endMs = new Date(appointment.end).getTime();
        const invalidEnd = !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs;
        const durationMinutes = invalidEnd ? 0 : Math.round((endMs - startMs) / 60_000);
        return <tr key={appointment.id}>
          <td data-label="Appointment"><div className="table-person"><span className="table-icon"><Icon name="calendar" size={15} /></span><span className="font-medium">{appointment.title}</span></div></td>
          <td data-label="Contact">{contact ? <Link to={`/contacts/${contact.id}`} className="app-link">{contact.name}</Link> : <span className="text-text-muted">Contact unavailable</span>}</td>
          <td data-label="Date & time"><div className="appointment-date-time"><strong className="font-medium">{dateLabel(appointment.start)}</strong><span>{invalidEnd ? "Invalid end time" : `${clock(appointment.start)}–${clock(appointment.end)}`}</span>{!invalidEnd && <span className="duration-chip">{durationMinutes} min</span>}</div></td>
          <td data-label="Status"><StatusBadge label={appointment.status[0].toUpperCase() + appointment.status.slice(1)} /></td>
          <td data-label="Action" className="table-action-cell">{appointment.status === "booked" ? <Button size="md" variant="danger-ghost" leadingIcon={<Icon name="close" size={14} />} onClick={() => setCancelId(appointment.id)}>Cancel booking</Button> : <span className="text-xs text-text-muted">—</span>}</td>
        </tr>;
      })}</tbody></table></div> : <EmptyState title={appointments.length ? `No ${dateTab} appointments match these filters.` : "No appointments yet"} body={appointments.length ? "Try a different search or status." : "Appointments will appear here when they are scheduled for a contact."} />}
      {rows.length > 0 && <div className="data-table-footer"><span aria-live="polite">Showing 1–{rows.length} of {rows.length} appointments</span></div>}
    </div>
    <ConfirmDialog open={!!cancelId} title="Cancel this appointment?" body="This will update the appointment record and its calendar event when connected." confirmLabel="Cancel appointment" danger onConfirm={cancel} onCancel={() => setCancelId(null)} />
  </div>;
}
